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

export function getCategoryLabel(types: string[], language: "es" | "en" | "pt" = "es"): string {
    const map: Record<string, Record<"es" | "en" | "pt", string>> = {
        restaurant: { es: "Restaurante", en: "Restaurant", pt: "Restaurante" },
        cafe: { es: "Café", en: "Cafe", pt: "Café" },
        bar: { es: "Bar", en: "Bar", pt: "Bar" },
        bakery: { es: "Panadería", en: "Bakery", pt: "Padaria" },
        supermarket: { es: "Supermercado", en: "Supermarket", pt: "Supermercado" },
        grocery_or_supermarket: { es: "Tienda", en: "Grocery", pt: "Mercado" },
        convenience_store: { es: "Tienda", en: "Convenience", pt: "Loja" },
        pharmacy: { es: "Farmacia", en: "Pharmacy", pt: "Farmácia" },
        hospital: { es: "Hospital", en: "Hospital", pt: "Hospital" },
        doctor: { es: "Médico", en: "Doctor", pt: "Médico" },
        gym: { es: "Gimnasio", en: "Gym", pt: "Academia" },
        bank: { es: "Banco", en: "Bank", pt: "Banco" },
        atm: { es: "Cajero", en: "ATM", pt: "Caixa" },
        gas_station: { es: "Gasolinera", en: "Gas Station", pt: "Posto" },
        school: { es: "Colegio", en: "School", pt: "Escola" },
        university: { es: "Universidad", en: "University", pt: "Universidade" },
        library: { es: "Biblioteca", en: "Library", pt: "Biblioteca" },
        park: { es: "Parque", en: "Park", pt: "Parque" },
        lodging: { es: "Hotel", en: "Hotel", pt: "Hotel" },
        hotel: { es: "Hotel", en: "Hotel", pt: "Hotel" },
        clothing_store: { es: "Ropa", en: "Clothing", pt: "Roupas" },
        shopping_mall: { es: "Centro Com.", en: "Mall", pt: "Shopping" },
        store: { es: "Tienda", en: "Store", pt: "Loja" },
        beauty_salon: { es: "Salón", en: "Salon", pt: "Salão" },
        hair_care: { es: "Peluquería", en: "Hair Care", pt: "Cabeleireiro" },
        spa: { es: "Spa", en: "Spa", pt: "Spa" },
        tourist_attraction: { es: "Atracción", en: "Attraction", pt: "Atração" },
        museum: { es: "Museo", en: "Museum", pt: "Museu" },
    };
    for (const t of types) if (map[t]) return map[t][language];
    return { es: "Negocio", en: "Business", pt: "Negócio" }[language];
}
