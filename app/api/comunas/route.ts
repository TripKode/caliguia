import { NextResponse } from "next/server";

export async function GET() {
  const url = "https://ws-idesc.cali.gov.co/geoserver/wfs" +
              "?service=WFS" +
              "&version=1.1.0" +
              "&request=GetFeature" +
              "&typeName=idesc:mc_comunas" +
              "&outputFormat=application/json" +
              "&srsName=EPSG:4326";

  try {
    const response = await fetch(url, {
      next: { revalidate: 86400 } // Cache por 24 horas en el servidor
    });
    
    if (!response.ok) {
      throw new Error("Error fetching from IDESC");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("IDESC Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch map data" }, { status: 500 });
  }
}
