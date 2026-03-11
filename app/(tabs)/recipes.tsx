import { useState } from 'react';
import {
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

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      borderColor: colors.icon,
      backgroundColor: colorScheme === 'dark' ? '#1e2324' : '#f5f5f5',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="title">Recipes</ThemedText>
        <ThemedText style={{ color: colors.icon }}>
          {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
        </ThemedText>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <ThemedView style={styles.itemCard}>
            <Pressable style={styles.itemInfo} onPress={() => openDetailModal(item)}>
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
            <Pressable onPress={() => handleDeleteRecipe(item.id)} hitSlop={12} style={styles.deleteButton}>
              <Text style={styles.deleteIcon}>✕</Text>
            </Pressable>
          </ThemedView>
        )}
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
                <ThemedText type="subtitle" style={styles.modalTitle}>{selectedRecipe.name}</ThemedText>

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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
});
