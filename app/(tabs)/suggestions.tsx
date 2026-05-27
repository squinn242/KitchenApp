import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Recipe, useAppContext } from '@/context/app-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

interface SuggestedRecipe {
  name: string;
  ingredients: { name: string; amount: string }[];
  steps: string[];
  missing: string[];
}

export default function SuggestionsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { inventoryItems, recipes, setRecipes } = useAppContext();

  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState<SuggestedRecipe | null>(null);

  // Q&A
  const [question, setQuestion] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);
  const [showAskInput, setShowAskInput] = useState(false);

  // Preferences
  const [prefsExpanded, setPrefsExpanded] = useState(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set());
  const [recipeRequest, setRecipeRequest] = useState('');

  function toggleIngredient(id: string) {
    setSelectedIngredientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function fetchSuggestions() {
    if (inventoryItems.length === 0) {
      Alert.alert('Empty Inventory', 'Add some items to your inventory first so Claude has something to work with.');
      return;
    }

    setLoading(true);
    try {
      const inventoryList = inventoryItems.map(i => i.quantity ? `${i.name} (${i.quantity})` : i.name).join(', ');

      // Build extra constraints from preferences
      const mustIncludeItems = inventoryItems.filter(i => selectedIngredientIds.has(i.id));
      let extraInstructions = '';
      if (mustIncludeItems.length > 0) {
        const names = mustIncludeItems.map(i => i.name).join(', ');
        extraInstructions += `\n\nIMPORTANT: Every recipe MUST use these ingredients: ${names}.`;
      }
      if (recipeRequest.trim()) {
        extraInstructions += `\n\nAdditional request from the user: "${recipeRequest.trim()}". Tailor your suggestions to match this request.`;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: `I have the following items in my kitchen inventory: ${inventoryList}.\n\nSuggest 5 recipes I could make. Prefer recipes that use mostly what I already have. It's okay if a recipe needs a few common pantry staples I might not have listed (salt, pepper, oil, water, etc.) — list those as missing only if they're meaningful (e.g. a specific spice or fresh herb).${extraInstructions}\n\nReturn ONLY a valid JSON array with no other text. Each element must have:\n- "name": string (recipe name)\n- "ingredients": array of {"name": string, "amount": string}\n- "steps": array of strings (numbered cooking steps — each step should be a clear instruction, include cook/prep times where relevant, e.g. "Sauté onions over medium heat for 3-4 minutes until translucent.")\n- "missing": array of strings (ingredient names from the recipe that are NOT in my inventory)\n\nExample: [{"name":"Scrambled Eggs","ingredients":[{"name":"Eggs","amount":"3"},{"name":"Butter","amount":"1 tbsp"}],"steps":["Crack eggs into a bowl, add a pinch of salt, and whisk until combined.","Melt butter in a non-stick pan over low heat (about 1 minute).","Pour in eggs and stir gently with a spatula for 2-3 minutes until just set. Serve immediately."],"missing":[]}]`,
          }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? `API error ${response.status}`);
      }

      const data = await response.json();
      const text: string = data.content[0].text.trim();
      const jsonText = text.startsWith('[') ? text : text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
      const parsed: SuggestedRecipe[] = JSON.parse(jsonText);

      if (!parsed.length) {
        Alert.alert('No suggestions', 'Claude couldn\'t come up with anything. Try adding more items to your inventory.');
        return;
      }

      setSuggestions(parsed);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to get suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function openDetail(recipe: SuggestedRecipe) {
    setSelected(recipe);
    setQaHistory([]);
    setQuestion('');
    setShowAskInput(false);
    setDetailVisible(true);
  }

  function saveToRecipes(suggestion: SuggestedRecipe) {
    const exists = recipes.some(r => r.name.toLowerCase() === suggestion.name.toLowerCase());
    if (exists) {
      Alert.alert('Already Saved', `"${suggestion.name}" is already in your recipes.`);
      return;
    }
    const newRecipe: Recipe = {
      id: Date.now().toString(),
      name: suggestion.name,
      ingredients: suggestion.ingredients.map(ing => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: ing.name,
        amount: ing.amount,
      })),
      description: suggestion.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    };
    setRecipes(prev => [newRecipe, ...prev]);
    Alert.alert('Saved', `"${suggestion.name}" added to your Recipes tab.`);
    setDetailVisible(false);
  }

  async function handleAskQuestion() {
    if (!question.trim() || !selected) return;
    const q = question.trim();
    setQuestion('');
    setAskingQuestion(true);
    try {
      const recipeContext = `Recipe: ${selected.name}\nIngredients: ${selected.ingredients.map(i => `${i.name} (${i.amount})`).join(', ')}\nSteps:\n${selected.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Here is a recipe:\n\n${recipeContext}\n\nThe user asks: "${q}"\n\nGive a helpful, concise answer (2-4 sentences). If the question is about substitutions, timing, technique, or dietary concerns, address it directly.`,
          }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? `API error ${response.status}`);
      }

      const data = await response.json();
      const answer: string = data.content[0].text.trim();
      setQaHistory(prev => [...prev, { q, a: answer }]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to get an answer.');
    } finally {
      setAskingQuestion(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="title">Suggestions</ThemedText>
        <ThemedText style={{ color: colors.icon }}>
          Recipe ideas based on your inventory
        </ThemedText>
      </View>

      {/* Preferences */}
      <Pressable
        style={styles.prefsToggle}
        onPress={() => setPrefsExpanded(p => !p)}>
        <ThemedText type="defaultSemiBold" style={styles.prefsToggleText}>
          Customize suggestions
        </ThemedText>
        <ThemedText style={{ color: colors.icon, fontSize: 14 }}>
          {prefsExpanded ? '▲' : '▼'}
        </ThemedText>
      </Pressable>

      {prefsExpanded && (
        <View style={styles.prefsContainer}>
          {/* Recipe request */}
          <ThemedText style={[styles.prefsLabel, { color: colors.icon }]}>
            What are you in the mood for?
          </ThemedText>
          <TextInput
            style={[
              styles.requestInput,
              {
                color: colors.text,
                borderColor: colors.icon,
                backgroundColor: colorScheme === 'dark' ? '#1e2324' : '#f5f5f5',
              },
            ]}
            value={recipeRequest}
            onChangeText={setRecipeRequest}
            placeholder="e.g. something spicy, Italian, quick lunch..."
            placeholderTextColor={colors.icon}
            returnKeyType="done"
          />

          {/* Ingredient picker */}
          {inventoryItems.length > 0 && (
            <>
              <ThemedText style={[styles.prefsLabel, { color: colors.icon, marginTop: 12 }]}>
                Must-use ingredients
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}>
                {inventoryItems.map(item => {
                  const isSelected = selectedIngredientIds.has(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleIngredient(item.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? colors.tint
                            : colors.subtleBackground,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected
                              ? (colorScheme === 'dark' ? '#000' : '#fff')
                              : colors.text,
                          },
                        ]}>
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.fetchButton, { backgroundColor: colors.tint }, loading && { opacity: 0.7 }]}
          onPress={fetchSuggestions}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color={colorScheme === 'dark' ? '#000' : '#fff'} />
            : <Text style={[styles.fetchButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                {suggestions.length > 0 ? '✨ Get New Suggestions' : '✨ Get Recipe Suggestions'}
              </Text>}
        </Pressable>
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(_, index) => index.toString()}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => openDetail(item)}>
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <ThemedText type="defaultSemiBold" style={styles.itemName}>{item.name}</ThemedText>
              <ThemedText style={[styles.itemMeta, { color: colors.icon }]}>
                {item.ingredients.length} {item.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                {item.missing.length > 0 ? ` • ${item.missing.length} missing` : ' • all in stock'}
              </ThemedText>
              <ThemedText numberOfLines={2} style={[styles.itemDescription, { color: colors.icon }]}>
                {item.steps[0]}
              </ThemedText>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={{ color: colors.icon, textAlign: 'center', lineHeight: 24 }}>
              {loading
                ? 'Asking Claude what to cook…'
                : 'Tap the button above to get recipe ideas based on what you have on hand.'}
            </ThemedText>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setDetailVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDetailVisible(false)} />
          <ThemedView style={styles.modalContent}>
            {selected && (
              <>
                <ThemedText type="subtitle" style={styles.modalTitle}>{selected.name}</ThemedText>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Ingredients</ThemedText>
                  {selected.ingredients.map((ing, idx) => {
                    const isMissing = selected.missing.some(
                      m => m.toLowerCase() === ing.name.toLowerCase()
                    );
                    return (
                      <View key={idx} style={styles.bulletRow}>
                        <Text style={{ color: isMissing ? '#DC2626' : '#16A34A' }}>•</Text>
                        <Text style={[styles.bulletText, { color: isMissing ? '#DC2626' : '#16A34A' }]}>
                          {ing.name}{ing.amount ? ` — ${ing.amount}` : ''}
                        </Text>
                      </View>
                    );
                  })}

                  <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Steps</ThemedText>
                  {selected.steps.map((step, idx) => (
                    <View key={idx} style={styles.stepRow}>
                      <Text style={[styles.stepNumber, { color: colors.tint }]}>{idx + 1}.</Text>
                      <ThemedText style={styles.stepText}>{step}</ThemedText>
                    </View>
                  ))}

                  {/* Q&A Section */}
                  {qaHistory.length > 0 && (
                    <>
                      <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Questions</ThemedText>
                      {qaHistory.map((item, idx) => (
                        <View key={idx} style={styles.qaBlock}>
                          <ThemedText type="defaultSemiBold" style={styles.qaQuestion}>Q: {item.q}</ThemedText>
                          <ThemedText style={styles.qaAnswer}>{item.a}</ThemedText>
                        </View>
                      ))}
                    </>
                  )}

                  {showAskInput && (
                    <View style={styles.askInputRow}>
                      <TextInput
                        style={[
                          styles.askInput,
                          {
                            color: colors.text,
                            borderColor: colors.icon,
                            backgroundColor: colors.subtleBackground,
                          },
                        ]}
                        value={question}
                        onChangeText={setQuestion}
                        placeholder="e.g. Can I substitute butter for oil?"
                        placeholderTextColor={colors.icon}
                        returnKeyType="send"
                        onSubmitEditing={handleAskQuestion}
                        editable={!askingQuestion}
                        autoFocus
                      />
                      <Pressable
                        style={[styles.askSendButton, { backgroundColor: colors.tint }, askingQuestion && { opacity: 0.7 }]}
                        onPress={handleAskQuestion}
                        disabled={askingQuestion || !question.trim()}>
                        {askingQuestion
                          ? <ActivityIndicator color={colorScheme === 'dark' ? '#000' : '#fff'} size="small" />
                          : <Text style={{ color: colorScheme === 'dark' ? '#000' : '#fff', fontWeight: '600' }}>Ask</Text>}
                      </Pressable>
                    </View>
                  )}

                  <View style={{ height: 16 }} />
                </ScrollView>

                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                    onPress={() => setDetailVisible(false)}>
                    <ThemedText>Close</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.askButton, { borderColor: colors.tint }]}
                    onPress={() => setShowAskInput(v => !v)}>
                    <Text style={[styles.askButtonText, { color: colors.tint }]}>
                      {showAskInput ? 'Hide' : 'Ask a Question'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.tint }]}
                    onPress={() => saveToRecipes(selected)}>
                    <Text style={[styles.saveButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                      Save
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 2,
  },
  prefsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  prefsToggleText: {
    fontSize: 15,
  },
  prefsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  prefsLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  requestInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fetchButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  fetchButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  itemName: {
    fontSize: 16,
  },
  itemMeta: {
    fontSize: 13,
  },
  itemDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 30,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalTitle: {
    marginBottom: 4,
  },
  modalScroll: {
    flexGrow: 0,
  },
  sectionLabel: {
    fontSize: 13,
    marginTop: 14,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignItems: 'flex-start',
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    alignItems: 'flex-start',
  },
  stepNumber: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    minWidth: 20,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  qaBlock: {
    marginTop: 8,
    gap: 4,
  },
  qaQuestion: {
    fontSize: 14,
  },
  qaAnswer: {
    fontSize: 14,
    lineHeight: 20,
  },
  askInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  askInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  askSendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  askButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  saveButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
});
