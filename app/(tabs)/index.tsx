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
import { estimateExpirations } from '@/lib/estimate-expiration';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

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
  const [saveLoading, setSaveLoading] = useState(false);

  // Receipt scan
  const [scanLoading, setScanLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [editingParsedIndex, setEditingParsedIndex] = useState<number | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

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
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    Alert.alert('Delete Items', `Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
          exitSelectMode();
        },
      },
    ]);
  }

  const expiredIds = items.filter(i => getExpirationStatus(i.expirationDate) === 'expired').map(i => i.id);

  function selectExpired() {
    setSelectedIds(new Set(expiredIds));
  }


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

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    let exp = expirationDate.trim();
    if (editingItem) {
      setItems(prev => prev.map(i =>
        i.id === editingItem.id
          ? { ...i, name: name.trim(), quantity: quantity.trim(), expirationDate: exp }
          : i
      ));
      closeModal();
      return;
    }
    // New item — if user didn't provide an expiration date, ask Claude
    if (!exp) {
      setSaveLoading(true);
      try {
        const [estimated] = await estimateExpirations([name.trim()]);
        if (estimated) exp = estimated;
      } finally {
        setSaveLoading(false);
      }
    }
    const newItem: InventoryItem = {
      id: Date.now().toString(),
      name: name.trim(),
      quantity: quantity.trim(),
      expirationDate: exp,
    };
    setItems(prev => [newItem, ...prev]);
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
                text: 'This is a grocery receipt. Extract all food and grocery items purchased. Return ONLY a valid JSON array with no other text, where each element has "name" (string) and "quantity" (string).\n\nRules:\n1. Simplify brand names and unusual product descriptions into common, readable item names. For example: "STARKIST SOLID WHITE" → "Canned Tuna", "KRFT MAC N CHS DLX" → "Mac and Cheese", "GV WHL MLK GAL" → "Whole Milk".\n2. If the same item appears multiple times on the receipt (whether as duplicate line entries or with a quantity indicator), consolidate them into a single entry and set "quantity" to the total count as a string (e.g. "3"). If the receipt shows a unit like "1 gal" or "12 ct" for a single item, use that instead.\n3. Only include actual purchased food/grocery items — not taxes, fees, totals, discounts, store info, or payment details.\n\nExample output: [{"name":"Whole Milk","quantity":"1 gal"},{"name":"Canned Tuna","quantity":"3"},{"name":"Large Eggs","quantity":"12 ct"}]',
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
      setEditingParsedIndex(null);
      setConfirmModalVisible(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to parse receipt. Please try again.');
    } finally {
      setScanLoading(false);
    }
  }

  function toggleParsedItem(index: number) {
    setParsedItems(prev => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ));
  }

  function updateParsedItem(index: number, field: 'name' | 'quantity', value: string) {
    setParsedItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  }

  async function handleAddParsedItems() {
    const selected = parsedItems.filter(i => i.selected);
    if (!selected.length) {
      Alert.alert('Nothing selected', 'Select at least one item to add.');
      return;
    }
    setScanLoading(true);
    let dates: string[] = [];
    try {
      dates = await estimateExpirations(selected.map(i => i.name));
    } finally {
      setScanLoading(false);
    }
    const toAdd: InventoryItem[] = selected.map((i, idx) => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2) + idx,
      name: i.name,
      quantity: i.quantity,
      expirationDate: dates[idx] ?? '',
    }));
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

    const isSelected = selectedIds.has(item.id);

    const accentColor =
      status === 'expired' ? '#DC2626' : status === 'soon' ? '#D97706' : status === 'ok' ? '#16A34A' : colors.cardBorder;

    return (
      <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
        {selectMode && (
          <Pressable onPress={() => toggleSelected(item.id)} hitSlop={8} style={styles.selectCheckboxWrap}>
            <View style={[styles.selectCircle, isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
              {isSelected && <Text style={styles.selectCheckmark}>✓</Text>}
            </View>
          </Pressable>
        )}
        <Pressable
          style={styles.itemInfo}
          onPress={() => selectMode ? toggleSelected(item.id) : openEditModal(item)}>
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
        {!selectMode && (
          <Pressable onPress={() => handleDelete(item.id)} hitSlop={12} style={styles.deleteButton}>
            <Text style={styles.deleteIcon}>✕</Text>
          </Pressable>
        )}
      </View>
    );
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
          <ThemedText type="title">Inventory</ThemedText>
          <View style={styles.headerActions}>
            {selectMode ? (
              <Pressable
                style={[styles.headerBtn, styles.headerBtnOutline, { borderColor: colors.icon }]}
                onPress={exitSelectMode}>
                <ThemedText style={styles.headerBtnText}>Cancel</ThemedText>
              </Pressable>
            ) : (
              <>
                {items.length > 0 && (
                  <Pressable
                    style={[styles.headerBtn, styles.headerBtnOutline, { borderColor: colors.icon }]}
                    onPress={enterSelectMode}>
                    <ThemedText style={styles.headerBtnText}>Edit</ThemedText>
                  </Pressable>
                )}
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
              </>
            )}
          </View>
        </View>
        <ThemedText style={{ color: colors.icon }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </ThemedText>
        {selectMode && (
          <View style={styles.selectBar}>
            <View style={styles.selectBarLeft}>
              <Pressable
                onPress={selectAll}
                style={[styles.selectAllPill, { backgroundColor: colors.subtleBackground }]}>
                <Text style={[styles.selectAllPillText, { color: colors.tint }]}>
                  {selectedIds.size === items.length ? 'Deselect All' : 'Select All'}
                </Text>
              </Pressable>
              {expiredIds.length > 0 && (
                <Pressable
                  onPress={selectExpired}
                  style={[styles.selectAllPill, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.selectAllPillText, { color: '#DC2626' }]}>
                    Select Expired ({expiredIds.length})
                  </Text>
                </Pressable>
              )}
            </View>
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

      {items.length > 0 && (
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              {
                color: colors.text,
                borderColor: colors.icon,
                backgroundColor: colors.subtleBackground,
              },
            ]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search inventory..."
            placeholderTextColor={colors.icon}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      )}

      <FlatList
        data={items
          .filter(i =>
            !searchQuery.trim() || i.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
          )
          .sort((a, b) => {
            const dateA = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
            const dateB = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
            return dateA - dateB;
          })}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={{ color: colors.icon, textAlign: 'center', lineHeight: 24 }}>
              {items.length === 0
                ? 'No items yet.\nTap + to add something.'
                : 'No matching items.'}
            </ThemedText>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={openAddModal}>
        <View style={styles.fabTextWrap}>
          <Text style={[styles.fabText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>+</Text>
        </View>
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
              placeholder={editingItem ? 'e.g. 2026-03-20' : 'Leave blank for AI estimate'}
              placeholderTextColor={colors.icon}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.icon }]}
                onPress={closeModal}
                disabled={saveLoading}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }, saveLoading && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saveLoading}>
                {saveLoading
                  ? <ActivityIndicator color={colorScheme === 'dark' ? '#000' : '#fff'} size="small" />
                  : <Text style={[styles.addButtonText, { color: colorScheme === 'dark' ? '#000' : '#fff' }]}>
                      {editingItem ? 'Save' : 'Add'}
                    </Text>}
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
            <ThemedText style={[styles.apiKeyHint, { color: '#E85D5D', fontStyle: 'italic' }]}>
              Warning: receipt abbreviations confuse the AI. Last week it turned WHL MLK into "Whale Milk" — please double-check before adding endangered species to your fridge.
            </ThemedText>
            <ThemedText style={[styles.apiKeyHint, { color: colors.icon }]}>
              Tap to deselect, or tap the pencil to edit.
            </ThemedText>

            <ScrollView style={styles.parsedList} showsVerticalScrollIndicator={false}>
              {parsedItems.map((item, index) => {
                const isEditing = editingParsedIndex === index;
                return (
                  <View key={index} style={styles.parsedItemRow}>
                    <Pressable
                      onPress={() => toggleParsedItem(index)}
                      hitSlop={6}>
                      <View style={[styles.parsedCheckbox, item.selected && { backgroundColor: colors.tint, borderColor: colors.tint }]}>
                        {item.selected && <Text style={styles.parsedCheckmark}>✓</Text>}
                      </View>
                    </Pressable>
                    {isEditing ? (
                      <View style={styles.parsedItemInfo}>
                        <TextInput
                          style={[inputStyle, { marginTop: 0, paddingVertical: 6 }]}
                          value={item.name}
                          onChangeText={t => updateParsedItem(index, 'name', t)}
                          placeholder="Item name"
                          placeholderTextColor={colors.icon}
                          autoFocus
                        />
                        <TextInput
                          style={[inputStyle, { marginTop: 4, paddingVertical: 6 }]}
                          value={item.quantity}
                          onChangeText={t => updateParsedItem(index, 'quantity', t)}
                          placeholder="Quantity"
                          placeholderTextColor={colors.icon}
                        />
                      </View>
                    ) : (
                      <Pressable
                        style={styles.parsedItemInfo}
                        onPress={() => toggleParsedItem(index)}>
                        <ThemedText style={[styles.parsedItemName, !item.selected && { color: colors.icon }]}>
                          {item.name}
                        </ThemedText>
                        {item.quantity ? (
                          <ThemedText style={[styles.parsedItemQty, { color: colors.icon }]}>
                            {item.quantity}
                          </ThemedText>
                        ) : null}
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setEditingParsedIndex(isEditing ? null : index)}
                      hitSlop={8}
                      style={styles.parsedEditButton}>
                      <Text style={[styles.parsedEditIcon, { color: isEditing ? colors.tint : colors.icon }]}>
                        {isEditing ? '✓' : '✎'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
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
    justifyContent: 'center',
  },
  scanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: false,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
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
  selectBarLeft: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 1,
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
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
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
  fabTextWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontSize: 30,
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
  parsedEditButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  parsedEditIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
});
