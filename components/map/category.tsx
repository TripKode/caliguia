import { 
    Utensils, 
    ShoppingCart, 
    Pill, 
    Dumbbell, 
    Landmark, 
    Fuel, 
    Book, 
    Hotel, 
    Leaf, 
    ShoppingBag, 
    MapPin,
    Search
} from "lucide-react";
import React from "react";

export function getCategoryIcon(types: string[]): React.ReactNode {
    if (types.some(t => ["restaurant", "food", "meal_takeaway", "cafe", "bakery", "bar"].includes(t))) return <Utensils className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["supermarket", "grocery_or_supermarket", "convenience_store"].includes(t))) return <ShoppingCart className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["pharmacy", "drugstore", "hospital", "doctor"].includes(t))) return <Pill className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["gym", "spa", "beauty_salon", "hair_care"].includes(t))) return <Dumbbell className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["bank", "atm", "finance"].includes(t))) return <Landmark className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["gas_station", "car_repair", "car_wash"].includes(t))) return <Fuel className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["school", "university", "library"].includes(t))) return <Book className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["lodging", "hotel"].includes(t))) return <Hotel className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["park", "tourist_attraction", "museum"].includes(t))) return <Leaf className="w-4 h-4 text-blue-500" />;
    if (types.some(t => ["clothing_store", "shopping_mall", "store"].includes(t))) return <ShoppingBag className="w-4 h-4 text-blue-500" />;
    return <MapPin className="w-4 h-4 text-blue-500" />;
}

export function getCategoryLabel(types: string[]): string {
    const map: Record<string, string> = {
        restaurant: "Restaurant", cafe: "Café", bar: "Bar", bakery: "Bakery",
        supermarket: "Supermercado", grocery_or_supermarket: "Tienda",
        pharmacy: "Farmacia", hospital: "Hospital", gym: "Gym",
        bank: "Banco", atm: "ATM", gas_station: "Gasolinera",
        school: "Colegio", park: "Parque", lodging: "Hotel",
        clothing_store: "Ropa", shopping_mall: "Centro Com.", store: "Tienda",
        beauty_salon: "Salón", hair_care: "Peluquería", spa: "Spa",
    };
    for (const t of types) if (map[t]) return map[t];
    return "Negocio";
}