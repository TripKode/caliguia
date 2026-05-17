"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Bed, Calendar, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

interface HotelData {
    hotelId: string;
    name: string;
    vendor1?: string; price1?: string;
    vendor2?: string; price2?: string;
    vendor3?: string; price3?: string;
    reviews?: { rating: number; count?: number };
}

interface HotelModalProps {
    hotel: HotelData | null;
    onClose: () => void;
}

interface VendorConfig {
    label: string;
    bg: string;
    textColor: string;
    buildUrl: (params: { name: string; checkin: string; checkout: string; adults: number; rooms: number }) => string;
}

const VENDORS: Record<string, VendorConfig> = {
    "Booking.com": {
        label: "Booking.com",
        bg: "#003580",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) => {
            const [ci_y, ci_m, ci_d] = checkin.split("-");
            const [co_y, co_m, co_d] = checkout.split("-");
            return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name)}&checkin_year=${ci_y}&checkin_month=${Number(ci_m)}&checkin_monthday=${Number(ci_d)}&checkout_year=${co_y}&checkout_month=${Number(co_m)}&checkout_monthday=${Number(co_d)}&group_adults=${adults}&no_rooms=${rooms}`;
        },
    },
    "Expedia.com": {
        label: "Expedia",
        bg: "#1c6bc2",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) =>
            `https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(name)}&startDate=${checkin}&endDate=${checkout}&rooms=${rooms}&adults=${adults}`,
    },
    "Hotels.com": {
        label: "Hotels.com",
        bg: "#c0392b",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) =>
            `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(name)}&q-check-in=${checkin}&q-check-out=${checkout}&q-rooms=${rooms}&q-room-0-adults=${adults}`,
    },
    "Priceline": {
        label: "Priceline",
        bg: "#0d3880",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) =>
            `https://www.priceline.com/hotel/results?hotel_name=${encodeURIComponent(name)}&check_in=${checkin}&check_out=${checkout}&adults=${adults}&rooms=${rooms}`,
    },
    "Agoda": {
        label: "Agoda",
        bg: "#e31837",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) =>
            `https://www.agoda.com/search?city=${encodeURIComponent(name)}&checkIn=${checkin}&checkOut=${checkout}&adults=${adults}&rooms=${rooms}`,
    },
    "Tripadvisor": {
        label: "Tripadvisor",
        bg: "#00af87",
        textColor: "#fff",
        buildUrl: ({ name, checkin, checkout, adults, rooms }) =>
            `https://www.tripadvisor.com/Search?q=${encodeURIComponent(name)}&checkin=${checkin}&checkout=${checkout}&adults=${adults}&rooms=${rooms}`,
    },
};

function resolveVendor(rawName?: string): VendorConfig | null {
    if (!rawName) return null;
    if (VENDORS[rawName]) return VENDORS[rawName];
    for (const key of Object.keys(VENDORS)) {
        if (rawName.toLowerCase().includes(key.toLowerCase().replace(".com", ""))) return VENDORS[key];
    }
    return {
        label: rawName,
        bg: "#374151",
        textColor: "#fff",
        buildUrl: ({ name }) =>
            `https://www.google.com/search?q=${encodeURIComponent(name + " reservar hotel")}`,
    };
}

export function HotelModal({ hotel, onClose }: HotelModalProps) {
    const t = useTranslations("HotelModal");

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const [checkin, setCheckin] = useState(today);
    const [checkout, setCheckout] = useState(tomorrow);
    const [adults, setAdults] = useState(2);
    const [rooms, setRooms] = useState(1);
    const [clicking, setClicking] = useState<string | null>(null);

    if (!hotel) return null;

    const rating = hotel.reviews?.rating ?? 0;
    const count = hotel.reviews?.count;

    const nights = Math.max(1, Math.round(
        (new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000
    ));

    const vendorEntries: Array<{ config: VendorConfig; price?: string }> = (
        [
            [hotel.vendor1, hotel.price1],
            [hotel.vendor2, hotel.price2],
            [hotel.vendor3, hotel.price3],
        ] as [string | undefined, string | undefined][]
    ).reduce<Array<{ config: VendorConfig; price?: string }>>((acc, [v, p]) => {
        const cfg = resolveVendor(v);
        if (cfg) acc.push({ config: cfg, price: p });
        return acc;
    }, []);

    const handleBook = (cfg: VendorConfig) => {
        setClicking(cfg.label);
        const url = cfg.buildUrl({ name: hotel.name, checkin, checkout, adults, rooms });
        setTimeout(() => {
            window.open(url, "_blank");
            setClicking(null);
        }, 700);
    };

    // Pluralization helpers
    const nightLabel = nights === 1 ? t("nightSingular", { count: nights }) : t("nightPlural", { count: nights });
    const adultLabel = adults === 1 ? t("adultSingular", { count: adults }) : t("adultPlural", { count: adults });
    const roomLabel = rooms === 1 ? t("roomSingular", { count: rooms }) : t("roomPlural", { count: rooms });

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm flex flex-col items-center pt-[12vh] pb-[5vh] md:pt-[20vh] md:pb-[10vh] px-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="bg-[#f9fafb] w-full max-w-md rounded-[32px] shadow-2xl overflow-y-auto min-h-0 relative no-scrollbar shrink"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-zinc-500 hover:text-zinc-800 transition-colors z-10"
                    >
                        <X size={18} strokeWidth={2.5} />
                    </button>

                    <div className="flex flex-col pt-8 pb-8 px-6">

                        {/* Icon + Name */}
                        <div className="flex flex-col items-center mb-5">
                            <div className="w-20 h-20 rounded-[22px] bg-purple-100 flex items-center justify-center mb-4 shadow-sm border border-purple-200">
                                <Bed className="w-9 h-9 text-purple-600" />
                            </div>
                            <h2 className="text-[17px] font-black text-zinc-900 text-center leading-snug mb-2">
                                {hotel.name}
                            </h2>
                            {rating > 0 && (
                                <div className="flex items-center gap-1.5">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={13} className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200"} />
                                    ))}
                                    <span className="text-sm font-bold text-zinc-800 ml-1">{rating.toFixed(1)}</span>
                                    {count && <span className="text-[11px] text-zinc-400">({count.toLocaleString()})</span>}
                                </div>
                            )}
                        </div>

                        {/* Booking Form */}
                        <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm mb-4">
                            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-3">{t("yourStay")}</p>

                            {/* Dates */}
                            <div className="flex gap-3 mb-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{t("checkin")}</label>
                                    <div className="relative">
                                        <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={checkin}
                                            min={today}
                                            onChange={(e) => {
                                                setCheckin(e.target.value);
                                                if (e.target.value >= checkout) {
                                                    const next = new Date(e.target.value);
                                                    next.setDate(next.getDate() + 1);
                                                    setCheckout(next.toISOString().split("T")[0]);
                                                }
                                            }}
                                            className="w-full pl-7 pr-2 py-2 text-[12px] font-medium text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{t("checkout")}</label>
                                    <div className="relative">
                                        <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={checkout}
                                            min={checkin}
                                            onChange={(e) => setCheckout(e.target.value)}
                                            className="w-full pl-7 pr-2 py-2 text-[12px] font-medium text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Guests & Rooms */}
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{t("adults")}</label>
                                    <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden h-9">
                                        <button onClick={() => setAdults(a => Math.max(1, a - 1))} className="px-3 h-full text-zinc-500 hover:bg-zinc-100 font-bold transition-colors text-base">−</button>
                                        <span className="flex-1 text-center text-[13px] font-bold text-zinc-800">{adults}</span>
                                        <button onClick={() => setAdults(a => Math.min(8, a + 1))} className="px-3 h-full text-zinc-500 hover:bg-zinc-100 font-bold transition-colors text-base">+</button>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{t("rooms")}</label>
                                    <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden h-9">
                                        <button onClick={() => setRooms(r => Math.max(1, r - 1))} className="px-3 h-full text-zinc-500 hover:bg-zinc-100 font-bold transition-colors text-base">−</button>
                                        <span className="flex-1 text-center text-[13px] font-bold text-zinc-800">{rooms}</span>
                                        <button onClick={() => setRooms(r => Math.min(8, r + 1))} className="px-3 h-full text-zinc-500 hover:bg-zinc-100 font-bold transition-colors text-base">+</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary */}
                        <p className="text-[11px] text-zinc-400 font-medium text-center mb-5">
                            {nightLabel} · {adultLabel} · {roomLabel}
                        </p>

                        {/* Booking Platform Buttons */}
                        <div className="flex flex-col gap-3">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center mb-1">{t("bookOn")}</p>
                            {vendorEntries.length > 0 ? vendorEntries.map(({ config, price }) => (
                                <motion.button
                                    key={config.label}
                                    onClick={() => handleBook(config)}
                                    whileTap={{ scale: 0.97 }}
                                    className="w-full py-3.5 px-5 rounded-2xl font-bold text-[13px] tracking-wide transition-all shadow-md flex items-center justify-between"
                                    style={{ background: clicking === config.label ? "#10b981" : config.bg, color: config.textColor }}
                                >
                                    <span className="font-black">
                                        {clicking === config.label ? t("redirecting") : config.label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {price && (
                                            <span className="text-[12px] font-black opacity-90 bg-white/20 px-2 py-0.5 rounded-lg">
                                                {price}<span className="font-medium text-[10px] opacity-75">{t("perNight")}</span>
                                            </span>
                                        )}
                                        <ExternalLink size={14} className="opacity-80" />
                                    </div>
                                </motion.button>
                            )) : Object.values(VENDORS).map((cfg) => (
                                <motion.button
                                    key={cfg.label}
                                    onClick={() => handleBook(cfg)}
                                    whileTap={{ scale: 0.97 }}
                                    className="w-full py-3.5 px-5 rounded-2xl font-bold text-[13px] tracking-wide transition-all shadow-md flex items-center justify-between"
                                    style={{ background: clicking === cfg.label ? "#10b981" : cfg.bg, color: cfg.textColor }}
                                >
                                    <span className="font-black">
                                        {clicking === cfg.label ? t("redirecting") : cfg.label}
                                    </span>
                                    <ExternalLink size={14} className="opacity-80" />
                                </motion.button>
                            ))}
                        </div>

                        {/* Powered By */}
                        <a
                            href="https://kodetap.site"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-8 mb-1 flex flex-col items-center justify-center opacity-70 hover:opacity-100 transition-all active:scale-95"
                        >
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1">{t("poweredBy")}</span>
                            <span className="text-[15px] text-zinc-800">
                                <span className="font-black">Kode</span><span className="italic font-medium">Tap</span>
                            </span>
                        </a>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
