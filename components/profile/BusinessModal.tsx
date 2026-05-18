"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, MapPin, ExternalLink, Phone, Globe, BookOpen, ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useMap } from "@/hooks/UseMap";
import { useTranslations } from "next-intl";

interface BusinessModalProps {
    placeId: string | null;
    onClose: () => void;
}

export function BusinessModal({ placeId, onClose }: BusinessModalProps) {
    const t = useTranslations("BusinessModal");
    const { mapInstance } = useMap();
    const [details, setDetails] = useState<google.maps.places.PlaceResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<"profile" | "catalog">("profile");
    const [activeCategory, setActiveCategory] = useState("Todo");
    const [mounted, setMounted] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!placeId || !mapInstance?.current) return;
        setDetails(null);
        setView("profile");
        setActiveCategory("Todo");
        setGalleryIndex(0);
        setLoading(true);
        const service = new google.maps.places.PlacesService(mapInstance.current);
        service.getDetails(
            {
                placeId,
                fields: ["name", "rating", "user_ratings_total", "formatted_phone_number", "photos", "url", "website", "opening_hours", "business_status", "icon"],
            },
            (place, status) => {
                setLoading(false);
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    setDetails(place);
                }
            }
        );
    }, [placeId, mapInstance]);

    if (!placeId || !mounted) return null;

    const profilePic = details?.photos?.[0]?.getUrl({ maxWidth: 200, maxHeight: 200 }) || details?.icon;
    const gallery = details?.photos?.map(p => p.getUrl({ maxWidth: 700, maxHeight: 500 })) || [];
    const visibleGallery = gallery.length > 1
        ? [gallery[galleryIndex % gallery.length], gallery[(galleryIndex + 1) % gallery.length]]
        : gallery;
    const isOpen = details?.opening_hours?.isOpen?.() ?? true;
    const rating = details?.rating ?? 5;
    const totalReviews = details?.user_ratings_total ?? 0;
    const visibleProducts = activeCategory === "Todo"
        ? MOCK_PRODUCTS
        : MOCK_PRODUCTS.filter(product => product.category === activeCategory);
    const goToPreviousPhoto = () => setGalleryIndex(index => (index - 1 + gallery.length) % gallery.length);
    const goToNextPhoto = () => setGalleryIndex(index => (index + 1) % gallery.length);

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-center pt-[9vh] pb-[5vh] md:pt-[14vh] md:pb-[10vh] px-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className={`bg-[#f9fafb] w-full shadow-2xl overflow-y-auto min-h-0 relative no-scrollbar shrink transition-all ${view === "catalog" ? "max-w-6xl rounded-[22px] h-[82vh]" : "max-w-md rounded-[32px]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm text-zinc-500 hover:text-zinc-800 transition-colors z-10"
                    >
                        <X size={18} strokeWidth={2.5} />
                    </button>

                    {view === "catalog" ? (
                        <div className="min-h-full bg-[#f7f6f3] text-zinc-950">
                            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-[#f7f6f3]/95 backdrop-blur px-4 py-4 md:px-8">
                                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <button
                                            onClick={() => setView("profile")}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
                                            aria-label="Volver al perfil"
                                        >
                                            <ArrowLeft size={20} />
                                        </button>
                                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white bg-zinc-200 shadow-sm">
                                            {profilePic ? (
                                                <img src={profilePic} alt={details?.name || "Catálogo"} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <BookOpen className="h-5 w-5 text-zinc-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Catálogo</p>
                                            <h2 className="truncate text-[17px] font-black leading-tight text-zinc-900">{details?.name || "Romeo Cargo Bike"}</h2>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-3xl font-black leading-none text-zinc-900">{MOCK_PRODUCTS.length}</p>
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Productos</p>
                                    </div>
                                </div>

                                <div className="mx-auto mt-5 max-w-5xl">
                                    <div className="flex h-14 items-center gap-3 border border-zinc-200 bg-white px-4 text-zinc-400">
                                        <Search size={20} />
                                        <input
                                            placeholder="Buscar producto, SKU o categoría..."
                                            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
                                        />
                                    </div>
                                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                                        {MOCK_CATEGORIES.map(category => (
                                            <button
                                                key={category}
                                                onClick={() => setActiveCategory(category)}
                                                className={`h-9 shrink-0 border px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${activeCategory === category ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900"}`}
                                            >
                                                {category}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 md:px-8">
                                {visibleProducts.map(product => (
                                    <article key={product.sku} className="overflow-hidden border border-zinc-200 bg-white shadow-sm">
                                        <div className="relative aspect-square bg-zinc-100">
                                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                                            <span className="absolute right-3 top-3 rounded bg-emerald-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                                                Consultar
                                            </span>
                                            <span className="absolute bottom-3 left-3 bg-zinc-950/75 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white">
                                                {product.category}
                                            </span>
                                        </div>
                                        <div className="border-b border-zinc-100 px-3 py-2">
                                            <div className="flex gap-1 overflow-x-auto pb-1">
                                                {product.thumbs.map((thumb, index) => (
                                                    <div key={`${product.sku}-${index}`} className="h-11 w-11 shrink-0 border border-zinc-200 bg-zinc-100">
                                                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="px-4 py-4">
                                            <h3 className="min-h-[44px] text-[16px] font-black leading-tight text-zinc-950">{product.name}</h3>
                                            <div className="mt-3 border-t border-zinc-200 pt-3">
                                                <p className="text-[20px] font-black text-zinc-950">{product.price}</p>
                                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">SKU {product.sku}</p>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="flex flex-col items-center justify-center py-24">
                            <div className="w-10 h-10 border-4 border-zinc-200 border-t-zinc-800 rounded-full animate-spin mb-4" />
                            <p className="text-zinc-500 text-sm font-medium">{t("loadingProfile")}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center pt-10 pb-8 px-6">
                            {/* Profile Image */}
                            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white mb-4">
                                {profilePic ? (
                                    <img src={profilePic} alt={details?.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
                                        <MapPin className="text-zinc-300 w-10 h-10" />
                                    </div>
                                )}
                            </div>

                            {/* Status Badge */}
                            {details?.business_status !== "CLOSED_PERMANENTLY" && (
                                <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 mb-3 shadow-sm ${isOpen ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    <div className={`w-2 h-2 rounded-full ${isOpen ? "bg-emerald-500" : "bg-red-500"}`} />
                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                        {isOpen ? t("openNow") : t("closed")}
                                    </span>
                                </div>
                            )}

                            {/* Name & Rating */}
                            <h2 className="text-xl font-bold text-zinc-900 text-center leading-tight mb-2">{details?.name}</h2>
                            <div className="flex items-center gap-1 mb-5">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} size={14} className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200"} />
                                ))}
                                <span className="text-sm font-bold text-zinc-800 ml-1">{rating.toFixed(1)}</span>
                                <span className="text-[12px] font-medium text-zinc-400 ml-1">({t("reviews", { count: totalReviews })})</span>
                            </div>

                            {/* Visit Button */}
                            <a
                                href={details?.url || `https://www.google.com/maps/search/?api=1&query=${details?.name}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-[#1e1e1e] hover:bg-black text-white px-8 py-3 rounded-2xl flex items-center gap-2 font-bold text-sm transition-all active:scale-95 shadow-md mb-6"
                            >
                                <MapPin size={16} />
                                {t("visit")}
                            </a>

                            {/* Photos Gallery */}
                            {visibleGallery.length > 0 && (
                                <div className="relative w-full mb-6">
                                    <div className="grid grid-cols-2 gap-3">
                                        {visibleGallery.map((url, idx) => (
                                            <div key={`${url}-${idx}`} className="overflow-hidden rounded-2xl bg-zinc-100 shadow-sm ring-1 ring-black/5" style={{ aspectRatio: "4/3" }}>
                                                <img src={url} alt={`${details?.name || "Negocio"} foto ${idx + 1}`} className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                    {gallery.length > 2 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={goToPreviousPhoto}
                                                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-800 shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
                                                aria-label="Foto anterior"
                                            >
                                                <ChevronLeft size={20} strokeWidth={2.5} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={goToNextPhoto}
                                                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-800 shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
                                                aria-label="Siguiente foto"
                                            >
                                                <ChevronRight size={20} strokeWidth={2.5} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Action Cards */}
                            <div className="w-full flex flex-col gap-3">
                                {/* Google Maps Review */}
                                <a
                                    href={details?.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-[#1e1e1e] rounded-xl p-4 flex items-center justify-between text-white hover:bg-black transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-2">
                                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-[13px] uppercase tracking-wide">{t("giveOpinion")}</p>
                                            <p className="text-[11px] text-zinc-400 font-medium">{t("rateOnGoogle")}</p>
                                        </div>
                                    </div>
                                    <ChevronRightIcon className="text-zinc-500 w-5 h-5" />
                                </a>

                                {/* Catalog */}
                                <button onClick={() => setView("catalog")} className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
                                            <BookOpen size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-[13px] text-zinc-900 uppercase tracking-wide">{t("seeCatalog")}</p>
                                            <p className="text-[11px] text-zinc-500 font-medium">{t("exploreProducts")}</p>
                                        </div>
                                    </div>
                                    <ChevronRightIcon className="text-zinc-400 w-5 h-5" />
                                </button>

                                {/* Social Links */}
                                <div className="mt-2 flex flex-col gap-2">
                                    <SocialLink icon={<InstagramIcon size={18} className="text-pink-600" />} title={t("instagram")} />
                                    <SocialLink icon={<FacebookIcon size={18} className="text-blue-600" />} title={t("facebook")} />
                                    <SocialLink icon={
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" /></svg>
                                    } title={t("tiktok")} />
                                    {details?.formatted_phone_number && (
                                        <SocialLink
                                            icon={<Phone size={18} className="text-emerald-500" />}
                                            title={t("whatsapp")}
                                            href={`https://wa.me/${details.formatted_phone_number.replace(/\D/g, "")}`}
                                        />
                                    )}
                                    {details?.website && (
                                        <SocialLink
                                            icon={<Globe size={18} className="text-blue-500" />}
                                            title={t("website")}
                                            href={details.website}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Powered By KodeTap */}
                            <a
                                href="https://kodetap.site"
                                target="_blank"
                                rel="noreferrer"
                                className="mt-10 mb-2 flex flex-col items-center justify-center opacity-80 hover:opacity-100 transition-all active:scale-95"
                            >
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1">{t("poweredBy")}</span>
                                <span className="text-[15px] text-zinc-800">
                                    <span className="font-black">Kode</span><span className="italic font-medium">Tap</span>
                                </span>
                            </a>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

const MOCK_CATEGORIES = ["Todo", "Fashion", "Deportes"];

const MOCK_PRODUCTS = [
    {
        sku: "CG-1048",
        name: "Gorra Oveja Negra",
        price: "$45.000",
        category: "Fashion",
        image: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-2081",
        name: "Gorras Urbanas",
        price: "$47.000",
        category: "Fashion",
        image: "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-3014",
        name: "Gorras Deportivo Cali",
        price: "$40.000",
        category: "Deportes",
        image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-4420",
        name: "Gorras NY",
        price: "$45.000",
        category: "Fashion",
        image: "https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-5109",
        name: "Gorra Cabalgata Negra",
        price: "$52.000",
        category: "Fashion",
        image: "https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-6193",
        name: "Gorra Bike Trail",
        price: "$49.000",
        category: "Deportes",
        image: "https://images.unsplash.com/photo-1544191696-15693072e10f?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1544191696-15693072e10f?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=160&q=80",
        ],
    },
    {
        sku: "CG-7305",
        name: "Pack Estadio Edición Cali",
        price: "$58.000",
        category: "Deportes",
        image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80",
        thumbs: [
            "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=160&q=80",
            "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=160&q=80",
        ],
    },
];

function SocialLink({ icon, title, href = "#" }: { icon: React.ReactNode; title: string; href?: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="bg-white border border-zinc-100 rounded-xl p-3.5 flex items-center justify-between hover:bg-zinc-50 transition-colors shadow-sm"
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center">
                    {icon}
                </div>
                <p className="font-bold text-[13px] text-zinc-800">{title}</p>
            </div>
            <ExternalLink className="text-zinc-300 w-4 h-4" />
        </a>
    );
}

function ChevronRightIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

function InstagramIcon({ size = 24, className }: { size?: number; className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
    );
}

function FacebookIcon({ size = 24, className }: { size?: number; className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
    );
}
