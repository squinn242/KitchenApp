import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { GroceryItem, useAppContext } from '@/context/app-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function GroceryListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { groceryItems: items, setGroceryItems: setItems, setInventoryItems } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');

  function openAddModal() {
    setModalKey(k => k + 1);
    setEditingItem(null);
    setName('');
    setQuantity('');
    setModalVisible(true);
  }

  function openEditModal(item: GroceryItem) {
    setModalKey(k => k + 1);
    setEditingItem(item);
    setName(item.name);
    setQuantity(item.quantity);
    setModalVisible(true);
  }

  function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    if (editingItem) {
      setItems(prev => prev.map(i =>
        i.id === editingItem.id
          ? { ...i, name: name.trim(), quantity: quantity.trim() }
          : i
      ));
    } else {
      const newItem: GroceryItem = {
        id: Date.now().toString(),
        name: name.trim(),
        quantity: quantity.trim(),
        checked: false,
      };
      setItems(prev => [newItem, ...prev]);
    }
    closeModal();
  }

  function handleToggle(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Item', 'Remove this item from your grocery list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setItems(prev => prev.filter(i => i.id !== id)),
      },
    ]);
  }

  function handleAddToInventory() {
    if (items.length === 0) {
      Alert.alert('Empty List', 'Your grocery list has no items to add.');
      return;
    }
    const checkedItems = items.filter(i => i.checked);
    const hasChecked = checkedItems.length > 0;

    Alert.alert(
      'Add to Inventory',
      hasChecked
        ? 'Which items would you like to add to your inventory?'
        : 'No items are checked. Add all items to inventory?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(hasChecked
          ? [
              {
                text: `Checked Only (${checkedItems.length})`,
                onPress: () => pushToInventory(checkedItems),
              },
            ]
          : []),
        {
          text: `All Items (${items.length})`,
          onPress: () => pushToInventory(items),
        },
      ]
    );
  }

  function pushToInventory(source: GroceryItem[]) {
    const sourceIds = new Set(source.map(g => g.id));
    const newInventoryItems = source.map(g => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: g.name,
      quantity: g.quantity,
      expirationDate: '',
    }));
    setInventoryItems(prev => [...newInventoryItems, ...prev]);
    setItems(prev => prev.filter(i => !sourceIds.has(i.id)));
    Alert.alert('Added', `${newInventoryItems.length} item${newInventoryItems.length === 1 ? '' : 's'} added to inventory.`);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingItem(null);
    setName('');
    setQuantity('');
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
        <View style={styles.headerTop}>
          <ThemedText type="title">Grocery List</ThemedText>
          {items.length > 0 && (
            <Pressable
              style={[styles.addToInventoryBtn, { backgroundColor: colors.tint }]}
              onPress={handleAddToInventory}>
              <Text style={[styles.addToInventoryText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                + Inventory
              </Text>
            </Pressable>
          )}
        </View>
        <ThemedText style={{ color: colors.icon }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </ThemedText>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ThemedView style={styles.itemCard}>
            <Pressable onPress={() => handleToggle(item.id)} hitSlop={8} style={styles.checkbox}>
              <View style={[styles.checkboxBox, item.checked && styles.checkboxChecked]}>
                {item.checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </Pressable>
            <Pressable style={styles.itemInfo} onPress={() => openEditModal(item)}>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.itemName, item.checked && styles.struckName]}>
                {item.name}
              </ThemedText>
              {item.quantity ? (
                <ThemedText style={[styles.itemMeta, { color: colors.icon }]}>
                  Qty: {item.quantity}
                </ThemedText>
              ) : null}
            </Pressable>
            <Pressable onPress={() => handleDelete(item.id)} hitSlop={12} style={styles.deleteButton}>
              <Text style={styles.deleteIcon}>✕</Text>
            </Pressable>
          </ThemedView>
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={{ color: colors.icon, textAlign: 'center', lineHeight: 24 }}>
              {'No items yet.\nTap + to add something.'}
            </ThemedText>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={openAddModal}>
        <Text style={[styles.fabText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>+</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <ThemedView style={styles.modalContent}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {editingItem ? 'Edit Item' : 'Add Item'}
            </ThemedText>

            <ThemedText style={[styles.label, { color: colors.icon }]}>Name *</ThemedText>
            <TextInput
              key={`name-${modalKey}`}
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Eggs"
              placeholderTextColor={colors.icon}
              autoFocus
              returnKeyType="next"
            />

            <ThemedText style={[styles.label, { color: colors.icon }]}>Quantity</ThemedText>
            <TextInput
              key={`quantity-${modalKey}`}
              style={inputStyle}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 1 dozen"
              placeholderTextColor={colors.icon}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                onPress={closeModal}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSave}>
                <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  {editingItem ? 'Save' : 'Add'}
                </Text>
              </Pressable>
            </View>
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
  addToInventoryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addToInventoryText: {
    fontSize: 13,
    fontWeight: '600',
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
  checkbox: {
    marginRight: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  struckName: {
    textDecorationLine: 'line-through',
    textDecorationColor: '#DC2626',
    color: '#9CA3AF',
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
    gap: 4,
  },
  modalTitle: {
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
});
