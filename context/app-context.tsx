import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: string;
  expirationDate: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  checked: boolean;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  amount: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  description: string;
}

interface AppContextValue {
  inventoryItems: InventoryItem[];
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  groceryItems: GroceryItem[];
  setGroceryItems: React.Dispatch<React.SetStateAction<GroceryItem[]>>;
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
}

const AppContext = createContext<AppContextValue | null>(null);

const INVENTORY_KEY = '@kitchenapp/inventory';
const GROCERY_KEY = '@kitchenapp/grocery';
const RECIPES_KEY = '@kitchenapp/recipes';

export function AppProvider({ children }: { children: ReactNode }) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // Load persisted data on mount
  useEffect(() => {
    async function load() {
      const [inv, groc, rec] = await Promise.all([
        AsyncStorage.getItem(INVENTORY_KEY),
        AsyncStorage.getItem(GROCERY_KEY),
        AsyncStorage.getItem(RECIPES_KEY),
      ]);
      if (inv) setInventoryItems(JSON.parse(inv));
      if (groc) setGroceryItems(JSON.parse(groc));
      if (rec) setRecipes(JSON.parse(rec));
    }
    load();
  }, []);

  // Persist whenever data changes
  useEffect(() => {
    AsyncStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryItems));
  }, [inventoryItems]);

  useEffect(() => {
    AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(groceryItems));
  }, [groceryItems]);

  useEffect(() => {
    AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  }, [recipes]);

  return (
    <AppContext.Provider value={{ inventoryItems, setInventoryItems, groceryItems, setGroceryItems, recipes, setRecipes }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
