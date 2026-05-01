export function getCategoryIcon(types: string[]): string {
    if (types.some(t => ["restaurant", "food", "meal_takeaway", "cafe", "bakery", "bar"].includes(t))) return "🍽️";
    if (types.some(t => ["supermarket", "grocery_or_supermarket", "convenience_store"].includes(t))) return "🛒";
    if (types.some(t => ["pharmacy", "drugstore", "hospital", "doctor"].includes(t))) return "💊";
    if (types.some(t => ["gym", "spa", "beauty_salon", "hair_care"].includes(t))) return "💆";
    if (types.some(t => ["bank", "atm", "finance"].includes(t))) return "🏦";
    if (types.some(t => ["gas_station", "car_repair", "car_wash"].includes(t))) return "⛽";
    if (types.some(t => ["school", "university", "library"].includes(t))) return "📚";
    if (types.some(t => ["lodging", "hotel"].includes(t))) return "🏨";
    if (types.some(t => ["park", "tourist_attraction", "museum"].includes(t))) return "🌿";
    if (types.some(t => ["clothing_store", "shopping_mall", "store"].includes(t))) return "🛍️";
    return "📍";
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