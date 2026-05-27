import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Recipe, useAppContext } from '@/context/app-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

interface DraftIngredient {
  key: string;
  name: string;
  amount: string;
}

function newIngredientRow(): DraftIngredient {
  return { key: Date.now().toString() + Math.random().toString(36).slice(2), name: '', amount: '' };
}

export default function RecipesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { recipes, setRecipes, inventoryItems, groceryItems, setGroceryItems } = useAppContext();

  // Add/Edit modal
  const [addVisible, setAddVisible] = useState(false);
  const [addModalKey, setAddModalKey] = useState(0);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([newIngredientRow()]);
  const [draftDescription, setDraftDescription] = useState('');

  // Detail modal
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === recipes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(recipes.map(r => r.id)));
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    Alert.alert('Delete Recipes', `Delete ${selectedIds.size} recipe${selectedIds.size === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setRecipes(prev => prev.filter(r => !selectedIds.has(r.id)));
          exitSelectMode();
        },
      },
    ]);
  }

  function openAddModal() {
    setAddModalKey(k => k + 1);
    setEditingRecipeId(null);
    setDraftName('');
    setDraftIngredients([newIngredientRow()]);
    setDraftDescription('');
    setAddVisible(true);
  }

  function openEditModal(recipe: Recipe) {
    setAddModalKey(k => k + 1);
    setEditingRecipeId(recipe.id);
    setDraftName(recipe.name);
    setDraftIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients.map(ing => ({ key: ing.id, name: ing.name, amount: ing.amount }))
        : [newIngredientRow()]
    );
    setDraftDescription(recipe.description);
    setDetailVisible(false);
    setAddVisible(true);
  }

  function closeAddModal() {
    setAddVisible(false);
    setEditingRecipeId(null);
  }

  function handleAddIngredientRow() {
    setDraftIngredients(prev => [...prev, newIngredientRow()]);
  }

  function handleRemoveIngredientRow(key: string) {
    setDraftIngredients(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);
  }

  function handleIngredientChange(key: string, field: 'name' | 'amount', value: string) {
    setDraftIngredients(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }

  function handleSaveRecipe() {
    if (!draftName.trim()) {
      Alert.alert('Required', 'Please enter a recipe name.');
      return;
    }
    const ingredients = draftIngredients
      .filter(r => r.name.trim() || r.amount.trim())
      .map(r => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: r.name.trim(),
        amount: r.amount.trim(),
      }));
    if (editingRecipeId) {
      setRecipes(prev => prev.map(r =>
        r.id === editingRecipeId
          ? { ...r, name: draftName.trim(), ingredients, description: draftDescription.trim() }
          : r
      ));
    } else {
      const newRecipe: Recipe = {
        id: Date.now().toString(),
        name: draftName.trim(),
        ingredients,
        description: draftDescription.trim(),
      };
      setRecipes(prev => [newRecipe, ...prev]);
    }
    closeAddModal();
  }

  function handleDeleteRecipe(id: string) {
    Alert.alert('Delete Recipe', 'Delete this recipe?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setRecipes(prev => prev.filter(r => r.id !== id));
          if (selectedRecipe?.id === id) setDetailVisible(false);
        },
      },
    ]);
  }

  function openDetailModal(recipe: Recipe) {
    setSelectedRecipe(recipe);
    setDetailVisible(true);
  }

  function isInInventory(ingredientName: string): boolean {
    return inventoryItems.some(
      item => item.name.toLowerCase() === ingredientName.toLowerCase()
    );
  }

  function handleAddMissingToGrocery() {
    if (!selectedRecipe) return;
    const missing = selectedRecipe.ingredients.filter(ing => !isInInventory(ing.name));
    if (missing.length === 0) {
      Alert.alert('All Set', 'You have all ingredients in your inventory!');
      return;
    }
    const alreadyInList = new Set(groceryItems.map(g => g.name.toLowerCase()));
    const toAdd = missing.filter(ing => !alreadyInList.has(ing.name.toLowerCase()));
    if (toAdd.length === 0) {
      Alert.alert('Already Listed', 'All missing ingredients are already in your shopping list.');
      return;
    }
    const newItems = toAdd.map(ing => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: ing.name,
      quantity: ing.amount,
      checked: false,
    }));
    setGroceryItems(prev => [...newItems, ...prev]);
    Alert.alert('Added', `${newItems.length} item${newItems.length === 1 ? '' : 's'} added to your shopping list.`);
  }

  // AI helper
  const [aiVisible, setAiVisible] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<ScrollView>(null);

  function openAiHelper() {
    setAiMessages([]);
    setAiQuestion('');
    setAiVisible(true);
  }

  function closeAiHelper() {
    setAiVisible(false);
    setAiMessages([]);
    setAiQuestion('');
  }

  async function handleAskAi() {
    const q = aiQuestion.trim();
    if (!q || !selectedRecipe) return;

    const userMsg = { role: 'user' as const, text: q };
    const updatedMessages = [...aiMessages, userMsg];
    setAiMessages(updatedMessages);
    setAiQuestion('');
    setAiLoading(true);

    try {
      const recipeContext = [
        `Recipe: ${selectedRecipe.name}`,
        selectedRecipe.ingredients.length > 0
          ? `Ingredients: ${selectedRecipe.ingredients.map(i => `${i.name}${i.amount ? ` (${i.amount})` : ''}`).join(', ')}`
          : '',
        selectedRecipe.description ? `Description: ${selectedRecipe.description}` : '',
        inventoryItems.length > 0
          ? `User's current inventory: ${inventoryItems.map(i => i.name).join(', ')}`
          : '',
      ].filter(Boolean).join('\n');

      const apiMessages = updatedMessages.map(m => ({
        role: m.role,
        content: m.text,
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: `You are a helpful cooking assistant. Answer questions about the following recipe. Keep answers concise and practical.\n\n${recipeContext}`,
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message ?? `API error ${response.status}`);
      }

      const data = await response.json();
      const answer = data.content[0].text.trim();
      setAiMessages(prev => [...prev, { role: 'assistant', text: answer }]);
    } catch (e: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message ?? 'Something went wrong.'}` }]);
    } finally {
      setAiLoading(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      borderColor: colors.icon,
      backgroundColor: colors.subtleBackground,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <ThemedText type="title">Recipes</ThemedText>
          {recipes.length > 0 && (
            <Pressable
              style={[styles.headerBtn, styles.headerBtnOutline, { borderColor: colors.icon }]}
              onPress={selectMode ? exitSelectMode : enterSelectMode}>
              <ThemedText style={styles.headerBtnText}>{selectMode ? 'Cancel' : 'Edit'}</ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedText style={{ color: colors.icon }}>
          {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
        </ThemedText>
        {selectMode && (
          <View style={styles.selectBar}>
            <Pressable
              onPress={selectAll}
              style={[styles.selectAllPill, { backgroundColor: colors.subtleBackground }]}>
              <Text style={[styles.selectAllPillText, { color: colors.tint }]}>
                {selectedIds.size === recipes.length ? 'Deselect All' : 'Select All'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0}
              style={[styles.deletePill, selectedIds.size === 0 && { opacity: 0.4 }]}>
              <Text style={styles.deletePillText}>
                Delete ({selectedIds.size})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        data={recipes}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              {selectMode && (
                <Pressable onPress={() => toggleSelected(item.id)} hitSlop={8} style={styles.selectCheckboxWrap}>
                  <View style={[styles.selectCircle, isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
                    {isSelected && <Text style={styles.selectCheckmark}>✓</Text>}
                  </View>
                </Pressable>
              )}
              <Pressable
                style={styles.itemInfo}
                onPress={() => selectMode ? toggleSelected(item.id) : openDetailModal(item)}>
                <ThemedText type="defaultSemiBold" style={styles.itemName}>{item.name}</ThemedText>
                <ThemedText style={[styles.itemMeta, { color: colors.icon }]}>
                  {item.ingredients.length} {item.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                </ThemedText>
                {item.description ? (
                  <ThemedText numberOfLines={1} style={[styles.itemMeta, { color: colors.icon }]}>
                    {item.description}
                  </ThemedText>
                ) : null}
              </Pressable>
              {!selectMode && (
                <Pressable onPress={() => handleDeleteRecipe(item.id)} hitSlop={12} style={styles.deleteButton}>
                  <Text style={styles.deleteIcon}>✕</Text>
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={{ color: colors.icon, textAlign: 'center', lineHeight: 24 }}>
              {'No recipes yet.\nTap + to add one.'}
            </ThemedText>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={openAddModal}>
        <Text style={[styles.fabText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>+</Text>
      </Pressable>

      {/* Add Recipe Modal */}
      <Modal
        visible={addVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />
          <ThemedView style={styles.modalContent}>
            <ThemedText type="subtitle" style={styles.modalTitle}>{editingRecipeId ? 'Edit Recipe' : 'Add Recipe'}</ThemedText>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>

              <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Name *</ThemedText>
              <TextInput
                key={`name-${addModalKey}`}
                style={inputStyle}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="e.g. Spaghetti Bolognese"
                placeholderTextColor={colors.icon}
                autoFocus
                returnKeyType="next"
              />

              <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Ingredients</ThemedText>
              {draftIngredients.map((row, index) => (
                <View key={row.key} style={styles.ingredientRow}>
                  <TextInput
                    key={`ing-name-${addModalKey}-${row.key}`}
                    style={[inputStyle, styles.ingredientNameInput]}
                    value={row.name}
                    onChangeText={v => handleIngredientChange(row.key, 'name', v)}
                    placeholder="Ingredient"
                    placeholderTextColor={colors.icon}
                    returnKeyType="next"
                  />
                  <TextInput
                    key={`ing-amount-${addModalKey}-${row.key}`}
                    style={[inputStyle, styles.ingredientAmountInput]}
                    value={row.amount}
                    onChangeText={v => handleIngredientChange(row.key, 'amount', v)}
                    placeholder="Amount"
                    placeholderTextColor={colors.icon}
                    returnKeyType="next"
                  />
                  {index > 0 && (
                    <Pressable
                      onPress={() => handleRemoveIngredientRow(row.key)}
                      hitSlop={8}
                      style={styles.removeRowButton}>
                      <Text style={styles.removeRowText}>✕</Text>
                    </Pressable>
                  )}
                </View>
              ))}

              <Pressable
                style={[styles.addRowButton, { borderColor: colors.icon }]}
                onPress={handleAddIngredientRow}>
                <ThemedText style={{ color: colors.icon, fontSize: 14 }}>+ Add ingredient</ThemedText>
              </Pressable>

              <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Description</ThemedText>
              <TextInput
                key={`desc-${addModalKey}`}
                style={[inputStyle, styles.descriptionInput]}
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder="Steps, notes, cooking time…"
                placeholderTextColor={colors.icon}
                multiline
                returnKeyType="default"
                textAlignVertical="top"
              />

              <View style={{ height: 16 }} />
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                onPress={closeAddModal}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSaveRecipe}>
                <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  {editingRecipeId ? 'Save' : 'Add'}
                </Text>
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>

      {/* AI Helper Modal */}
      <Modal
        visible={aiVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeAiHelper}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeAiHelper} />
          <ThemedView style={styles.modalContent}>
            <View style={styles.detailTitleRow}>
              <ThemedText type="subtitle" style={[styles.modalTitle, { flex: 1 }]}>
                Ask AI
              </ThemedText>
              <Pressable onPress={closeAiHelper} hitSlop={12}>
                <Text style={[styles.aiCloseText, { color: colors.icon }]}>✕</Text>
              </Pressable>
            </View>
            {selectedRecipe && (
              <ThemedText style={[styles.aiRecipeHint, { color: colors.icon }]}>
                About: {selectedRecipe.name}
              </ThemedText>
            )}

            <ScrollView
              ref={aiScrollRef}
              style={styles.aiChatScroll}
              contentContainerStyle={styles.aiChatContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => aiScrollRef.current?.scrollToEnd({ animated: true })}>
              {aiMessages.length === 0 && (
                <ThemedText style={[styles.aiPlaceholder, { color: colors.icon }]}>
                  Ask anything about this recipe — substitutions, cooking tips, dietary adjustments, etc.
                </ThemedText>
              )}
              {aiMessages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.aiBubble,
                    msg.role === 'user'
                      ? [styles.aiUserBubble, { backgroundColor: colors.tint }]
                      : [styles.aiAssistantBubble, { backgroundColor: colors.subtleBackground }],
                  ]}>
                  <Text
                    style={[
                      styles.aiBubbleText,
                      { color: msg.role === 'user' ? (colorScheme === 'dark' ? '#000' : '#fff') : colors.text },
                    ]}>
                    {msg.text}
                  </Text>
                </View>
              ))}
              {aiLoading && (
                <View style={[styles.aiBubble, styles.aiAssistantBubble, { backgroundColor: colors.subtleBackground }]}>
                  <ActivityIndicator size="small" color={colors.icon} />
                </View>
              )}
            </ScrollView>

            <View style={styles.aiInputRow}>
              <TextInput
                style={[
                  styles.aiInput,
                  {
                    color: colors.text,
                    borderColor: colors.icon,
                    backgroundColor: colors.subtleBackground,
                  },
                ]}
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder="e.g. Can I substitute butter for oil?"
                placeholderTextColor={colors.icon}
                returnKeyType="send"
                onSubmitEditing={handleAskAi}
                editable={!aiLoading}
              />
              <Pressable
                style={[styles.aiSendButton, { backgroundColor: colors.tint }, aiLoading && { opacity: 0.5 }]}
                onPress={handleAskAi}
                disabled={aiLoading || !aiQuestion.trim()}>
                <Text style={[styles.aiSendText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>Send</Text>
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>

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
            {selectedRecipe && (
              <>
                <View style={styles.detailTitleRow}>
                  <ThemedText type="subtitle" style={[styles.modalTitle, { flex: 1 }]}>{selectedRecipe.name}</ThemedText>
                  <Pressable
                    style={[styles.aiButton, { backgroundColor: colors.tint }]}
                    onPress={openAiHelper}>
                    <Text style={[styles.aiButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>Ask AI</Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}>

                  {selectedRecipe.ingredients.length > 0 && (
                    <>
                      <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Ingredients</ThemedText>
                      {selectedRecipe.ingredients.map(ing => {
                        const have = isInInventory(ing.name);
                        return (
                          <View key={ing.id} style={styles.bulletRow}>
                            <Text style={{ color: have ? '#16A34A' : '#DC2626' }}>•</Text>
                            <Text style={[styles.bulletText, { color: have ? '#16A34A' : '#DC2626' }]}>
                              {ing.name}{ing.amount ? ` — ${ing.amount}` : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </>
                  )}

                  {selectedRecipe.description ? (
                    <>
                      <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Description</ThemedText>
                      <ThemedText style={styles.descriptionText}>{selectedRecipe.description}</ThemedText>
                    </>
                  ) : null}

                  <View style={{ height: 16 }} />
                </ScrollView>

                {selectedRecipe.ingredients.length > 0 && (
                  <Pressable
                    style={[styles.addMissingButton, { backgroundColor: colors.tint }]}
                    onPress={handleAddMissingToGrocery}>
                    <Text style={[styles.addMissingText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                      Add Missing to Shopping List
                    </Text>
                  </Pressable>
                )}
                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                    onPress={() => setDetailVisible(false)}>
                    <ThemedText>Close</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.tint }]}
                    onPress={() => openEditModal(selectedRecipe)}>
                    <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.deleteRecipeButton]}
                    onPress={() => handleDeleteRecipe(selectedRecipe.id)}>
                    <Text style={styles.deleteRecipeText}>Delete</Text>
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  headerBtnOutline: {
    borderWidth: 1,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  selectAllPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  selectAllPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deletePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#DC2626',
  },
  deletePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  selectCheckboxWrap: {
    marginRight: 12,
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 16,
  },
  itemMeta: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  deleteIcon: {
    color: '#DC2626',
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: {
    fontSize: 30,
    lineHeight: 34,
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  ingredientNameInput: {
    flex: 2,
    marginTop: 0,
  },
  ingredientAmountInput: {
    flex: 1,
    marginTop: 0,
  },
  removeRowButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeRowText: {
    color: '#DC2626',
    fontSize: 14,
  },
  addRowButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  descriptionInput: {
    minHeight: 100,
    lineHeight: 22,
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
  addButtonText: {
    fontWeight: '600',
    fontSize: 16,
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
  deleteRecipeButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  deleteRecipeText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 16,
  },
  addMissingButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  addMissingText: {
    fontWeight: '600',
    fontSize: 16,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  aiCloseText: {
    fontSize: 20,
    fontWeight: '600',
  },
  aiRecipeHint: {
    fontSize: 13,
    marginBottom: 4,
  },
  aiChatScroll: {
    flexGrow: 0,
    maxHeight: 300,
    marginTop: 8,
  },
  aiChatContent: {
    gap: 8,
    paddingBottom: 4,
  },
  aiPlaceholder: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 24,
  },
  aiBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: '85%',
  },
  aiUserBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiAssistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  aiBubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  aiInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  aiSendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSendText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
