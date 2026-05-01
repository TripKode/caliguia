import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'Cali';

  if (!process.env.MAKCORPS_API_KEY) {
    return NextResponse.json({ error: 'MAKCORPS_API_KEY no configurada' }, { status: 500 });
  }

  try {
    // 1. Obtener el City ID para Cali
    const mappingRes = await fetch(`https://api.makcorps.com/mapping?api_key=${process.env.MAKCORPS_API_KEY}&name=${city}`);
    if (mappingRes.status === 429) {
        return getMockHotels();
    }
    
    if (!mappingRes.ok) {
        return NextResponse.json({ error: 'Error al conectar con la API de Mapping de Makcorps' }, { status: mappingRes.status });
    }
    
    const mappingData = await mappingRes.json();
    
    // Buscar el tipo GEO en la respuesta para obtener el document_id (city ID)
    let cityId = null;
    if (Array.isArray(mappingData)) {
      const geoItem = mappingData.find((d: any) => d.type === 'GEO');
      if (geoItem) {
        cityId = geoItem.document_id;
      }
    }

    if (!cityId) {
      // Fallback para Cali en caso de no encontrarse exacto (ID aproximado, ajustar si se requiere)
      cityId = '296084'; 
    }

    // Fechas dinámicas: Checkin hoy, Checkout mañana
    const today = new Date();
    const checkin = today.toISOString().split('T')[0];
    const checkoutDate = new Date(today);
    checkoutDate.setDate(today.getDate() + 1);
    const checkout = checkoutDate.toISOString().split('T')[0];

    // 2. Obtener lista de Hoteles
    const hotelsRes = await fetch(
      `https://api.makcorps.com/city?cityid=${cityId}&pagination=0&cur=COP&rooms=1&adults=2&checkin=${checkin}&checkout=${checkout}&api_key=${process.env.MAKCORPS_API_KEY}`
    );
    
    if (hotelsRes.status === 429) {
        return getMockHotels();
    }

    if (!hotelsRes.ok) {
        return NextResponse.json({ error: 'Error al consultar precios de hoteles' }, { status: hotelsRes.status });
    }

    const hotelsData = await hotelsRes.json();
    return NextResponse.json(hotelsData);
  } catch (error) {
    console.error("Makcorps API Error:", error);
    return NextResponse.json({ error: 'Fallo al obtener hoteles' }, { status: 500 });
  }
}

function getMockHotels() {
    return NextResponse.json([
        {
            hotelId: "mock-1",
            name: "InterContinental Cali, an IHG Hotel",
            vendor1: "Booking.com",
            price1: "$320,000",
            reviews: { rating: 4.8, count: 1250 }
        },
        {
            hotelId: "mock-2",
            name: "Hotel Spiwak Chipichape Cali",
            vendor1: "Expedia.com",
            price1: "$285,000",
            reviews: { rating: 4.7, count: 980 }
        },
        {
            hotelId: "mock-3",
            name: "Movich Casa del Alferez",
            vendor1: "Hotels.com",
            price1: "$350,000",
            reviews: { rating: 4.9, count: 640 }
        },
        {
            hotelId: "mock-4",
            name: "Dann Carlton Cali",
            vendor1: "Priceline",
            price1: "$210,000",
            reviews: { rating: 4.6, count: 2100 }
        }
    ]);
}
