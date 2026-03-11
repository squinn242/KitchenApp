import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
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
import { InventoryItem, useAppContext } from '@/context/app-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ANTHROPIC_KEY_STORAGE = '@kitchenapp/anthropic_key';

interface ParsedItem {
  name: string;
  quantity: string;
  selected: boolean;
}

function getExpirationStatus(dateStr: string): 'expired' | 'soon' | 'ok' | 'none' {
  if (!dateStr) return 'none';
  const expDate = new Date(dateStr);
  if (isNaN(expDate.getTime())) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InventoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { inventoryItems: items, setInventoryItems: setItems } = useAppContext();

  // Add/Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Receipt scan
  const [apiKey, setApiKey] = useState('');
  const [apiKeyModalVisible, setApiKeyModalVisible] = useState(false);
  const [apiKeyModalKey, setApiKeyModalKey] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ANTHROPIC_KEY_STORAGE).then(k => {
      if (k) setApiKey(k);
    });
  }, []);

  // ── Add/Edit modal ──────────────────────────────────────────────────────────

  function openAddModal() {
    setModalKey(k => k + 1);
    setEditingItem(null);
    setName('');
    setQuantity('');
    setExpirationDate('');
    setModalVisible(true);
  }

  function openEditModal(item: InventoryItem) {
    setModalKey(k => k + 1);
    setEditingItem(item);
    setName(item.name);
    setQuantity(item.quantity);
    setExpirationDate(item.expirationDate);
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
          ? { ...i, name: name.trim(), quantity: quantity.trim(), expirationDate: expirationDate.trim() }
          : i
      ));
    } else {
      const newItem: InventoryItem = {
        id: Date.now().toString(),
        name: name.trim(),
        quantity: quantity.trim(),
        expirationDate: expirationDate.trim(),
      };
      setItems(prev => [newItem, ...prev]);
    }
    closeModal();
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Item', 'Remove this item from your inventory?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setItems(prev => prev.filter(i => i.id !== id)),
      },
    ]);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingItem(null);
    setName('');
    setQuantity('');
    setExpirationDate('');
  }

  // ── Receipt scan ────────────────────────────────────────────────────────────

  async function handleScanReceipt() {
    if (!apiKey) {
      setApiKeyModalKey(k => k + 1);
      setApiKeyInput('');
      setApiKeyModalVisible(true);
      return;
    }
    Alert.alert('Scan Receipt', 'Choose image source', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Photo Library', onPress: () => pickImage('library') },
    ]);
  }

  async function pickImage(source: 'camera' | 'library') {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to scan receipts.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library permission is required to scan receipts.');
        return;
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, mediaTypes: ['images'] as any });

    if (result.canceled || !result.assets[0]?.base64) return;

    await parseReceiptWithClaude(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg');
  }

  async function parseReceiptWithClaude(base64: string, mimeType: string) {
    setScanLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: 'This is a grocery receipt. Extract all food and grocery items purchased. Return ONLY a valid JSON array with no other text, where each element has "name" (string) and "quantity" (string with unit if shown, else empty string). Example: [{"name":"Whole Milk","quantity":"1 gal"},{"name":"Large Eggs","quantity":"12 ct"}]. Only include actual purchased items — not taxes, fees, totals, store info, or payment details.',
              },
            ],
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
      const items: { name: string; quantity: string }[] = JSON.parse(jsonText);

      if (!items.length) {
        Alert.alert('No items found', 'Claude could not find any grocery items on this receipt.');
        return;
      }

      setParsedItems(items.map(item => ({ ...item, selected: true })));
      setConfirmModalVisible(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to parse receipt. Please try again.');
    } finally {
      setScanLoading(false);
    }
  }

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) {
      Alert.alert('Required', 'Please enter your Anthropic API key.');
      return;
    }
    await AsyncStorage.setItem(ANTHROPIC_KEY_STORAGE, key);
    setApiKey(key);
    setApiKeyModalVisible(false);
    // Proceed to scan now that key is saved
    setTimeout(() => {
      Alert.alert('Scan Receipt', 'Choose image source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera', onPress: () => pickImage('camera') },
        { text: 'Photo Library', onPress: () => pickImage('library') },
      ]);
    }, 300);
  }

  function toggleParsedItem(index: number) {
    setParsedItems(prev => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ));
  }

  function handleAddParsedItems() {
    const toAdd = parsedItems
      .filter(i => i.selected)
      .map(i => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: i.name,
        quantity: i.quantity,
        expirationDate: '',
      }));
    if (!toAdd.length) {
      Alert.alert('Nothing selected', 'Select at least one item to add.');
      return;
    }
    setItems(prev => [...toAdd, ...prev]);
    setConfirmModalVisible(false);
    setParsedItems([]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderItem({ item }: { item: InventoryItem }) {
    const status = getExpirationStatus(item.expirationDate);
    const statusColor =
      status === 'expired' ? '#DC2626' : status === 'soon' ? '#D97706' : '#16A34A';
    const statusLabel =
      status === 'expired'
        ? `Expired ${formatDate(item.expirationDate)}`
        : status === 'soon'
          ? `Expires ${formatDate(item.expirationDate)}`
          : status === 'ok'
            ? `Expires ${formatDate(item.expirationDate)}`
            : null;

    return (
      <ThemedView style={styles.itemCard}>
        <Pressable style={styles.itemInfo} onPress={() => openEditModal(item)}>
          <ThemedText type="defaultSemiBold" style={styles.itemName}>
            {item.name}
          </ThemedText>
          {item.quantity ? (
            <ThemedText style={[styles.itemMeta, { color: colors.icon }]}>
              Qty: {item.quantity}
            </ThemedText>
          ) : null}
          {statusLabel ? (
            <ThemedText style={[styles.itemMeta, { color: statusColor }]}>{statusLabel}</ThemedText>
          ) : null}
        </Pressable>
        <Pressable onPress={() => handleDelete(item.id)} hitSlop={12} style={styles.deleteButton}>
          <Text style={styles.deleteIcon}>✕</Text>
        </Pressable>
      </ThemedView>
    );
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
          <ThemedText type="title">Inventory</ThemedText>
          <Pressable
            style={[styles.scanButton, { backgroundColor: colors.tint }]}
            onPress={handleScanReceipt}
            disabled={scanLoading}>
            {scanLoading
              ? <ActivityIndicator color={colorScheme === 'dark' ? '#000' : '#fff'} size="small" />
              : <Text style={[styles.scanButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  Scan Receipt
                </Text>
            }
          </Pressable>
        </View>
        <ThemedText style={{ color: colors.icon }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </ThemedText>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
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

      {/* Add/Edit Modal */}
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
              placeholder="e.g. Milk"
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
              placeholder="e.g. 2 gallons"
              placeholderTextColor={colors.icon}
              returnKeyType="next"
            />

            <ThemedText style={[styles.label, { color: colors.icon }]}>
              Expiration Date (YYYY-MM-DD)
            </ThemedText>
            <TextInput
              key={`expiration-${modalKey}`}
              style={inputStyle}
              value={expirationDate}
              onChangeText={setExpirationDate}
              placeholder="e.g. 2026-03-20"
              placeholderTextColor={colors.icon}
              keyboardType="numbers-and-punctuation"
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

      {/* API Key Modal */}
      <Modal
        visible={apiKeyModalVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setApiKeyModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setApiKeyModalVisible(false)} />
          <ThemedView style={styles.modalContent}>
            <ThemedText type="subtitle" style={styles.modalTitle}>Anthropic API Key</ThemedText>
            <ThemedText style={[styles.apiKeyHint, { color: colors.icon }]}>
              Enter your Anthropic API key to enable receipt scanning. It will be stored locally on your device.
            </ThemedText>
            <TextInput
              key={`apikey-${apiKeyModalKey}`}
              style={[inputStyle, { marginTop: 12 }]}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="sk-ant-..."
              placeholderTextColor={colors.icon}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSaveApiKey}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                onPress={() => setApiKeyModalVisible(false)}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSaveApiKey}>
                <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm Parsed Items Modal */}
      <Modal
        visible={confirmModalVisible}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setConfirmModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setConfirmModalVisible(false)} />
          <ThemedView style={styles.modalContent}>
            <ThemedText type="subtitle" style={styles.modalTitle}>Items Found</ThemedText>
            <ThemedText style={[styles.apiKeyHint, { color: colors.icon }]}>
              Tap to deselect any items you don't want to add.
            </ThemedText>

            <ScrollView style={styles.parsedList} showsVerticalScrollIndicator={false}>
              {parsedItems.map((item, index) => (
                <Pressable
                  key={index}
                  style={styles.parsedItemRow}
                  onPress={() => toggleParsedItem(index)}>
                  <View style={[styles.parsedCheckbox, item.selected && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
                    {item.selected && <Text style={styles.parsedCheckmark}>✓</Text>}
                  </View>
                  <View style={styles.parsedItemInfo}>
                    <ThemedText style={[styles.parsedItemName, !item.selected && { color: colors.icon }]}>
                      {item.name}
                    </ThemedText>
                    {item.quantity ? (
                      <ThemedText style={[styles.parsedItemQty, { color: colors.icon }]}>
                        {item.quantity}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              ))}
              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                onPress={() => setConfirmModalVisible(false)}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleAddParsedItems}>
                <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                  Add {parsedItems.filter(i => i.selected).length} Items
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
  scanButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 110,
    alignItems: 'center',
  },
  scanButtonText: {
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
    maxHeight: '85%',
  },
  modalTitle: {
    marginBottom: 4,
  },
  apiKeyHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
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
  parsedList: {
    marginTop: 12,
    flexGrow: 0,
  },
  parsedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  parsedCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parsedCheckmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  parsedItemInfo: {
    flex: 1,
  },
  parsedItemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  parsedItemQty: {
    fontSize: 13,
  },
});
