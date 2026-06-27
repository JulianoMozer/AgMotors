// Página social dinâmica, executada pela Vercel antes de carregar a experiência do site.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nksnxvrpdhdcnemjycbw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_D_2YiLLH1-AviXVhH8_-2w_F09uMibo";
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://www.agmotorscuritiba.com.br").replace(/\/+$/, "");

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function absoluteImage(url = "") {
  try {
    return new URL(url, `${SITE_URL}/`).href;
  } catch {
    return `${SITE_URL}/img/fachada-ag-motors.jpg`;
  }
}

function vehicleDescription(vehicle) {
  const year = `${vehicle.year}/${vehicle.model_year || vehicle.year}`;
  const mileage = vehicle.mileage ? `${number.format(vehicle.mileage)} km` : "quilometragem sob consulta";
  const summary = cleanText(vehicle.description).slice(0, 155);
  return [money.format(vehicle.price), `ano ${year}`, mileage, summary].filter(Boolean).join(" • ").slice(0, 300);
}

function buildVehiclePage(vehicle) {
  const slug = encodeURIComponent(vehicle.slug);
  const vehicleName = cleanText(`${vehicle.brand} ${vehicle.model}`);
  const title = `${vehicleName} | AG Motors Curitiba`;
  const description = vehicleDescription(vehicle);
  const image = absoluteImage(vehicle.cover);
  const vehicleUrl = `${SITE_URL}/veiculo/${slug}`;
  const appUrl = `/?veiculo=${slug}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeHTML(description)}">
  <link rel="canonical" href="${escapeHTML(vehicleUrl)}">
  <meta property="og:type" content="product">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="AG Motors Curitiba">
  <meta property="og:title" content="${escapeHTML(vehicleName)}">
  <meta property="og:description" content="${escapeHTML(description)}">
  <meta property="og:image" content="${escapeHTML(image)}">
  <meta property="og:image:secure_url" content="${escapeHTML(image)}">
  <meta property="og:image:alt" content="${escapeHTML(vehicleName)} anunciado pela AG Motors Curitiba">
  <meta property="og:url" content="${escapeHTML(vehicleUrl)}">
  <meta property="product:price:amount" content="${Number(vehicle.price) || 0}">
  <meta property="product:price:currency" content="BRL">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHTML(vehicleName)}">
  <meta name="twitter:description" content="${escapeHTML(description)}">
  <meta name="twitter:image" content="${escapeHTML(image)}">
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body>
  <main>
    <h1>${escapeHTML(vehicleName)}</h1>
    <p>${escapeHTML(description)}</p>
    <p><a href="${escapeHTML(appUrl)}">Ver este veículo na AG Motors Curitiba</a></p>
  </main>
</body>
</html>`;
}

function buildNotFoundPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Veículo não encontrado | AG Motors Curitiba</title>
</head>
<body>
  <main>
    <h1>Veículo não encontrado</h1>
    <p>Este anúncio pode não estar mais disponível.</p>
    <p><a href="/">Ver estoque atual da AG Motors</a></p>
  </main>
</body>
</html>`;
}

async function findVehicle(slug) {
  const fields = "id,slug,brand,model,year,model_year,price,mileage,transmission,description,cover,status";
  const endpoint = `${SUPABASE_URL}/rest/v1/vehicles?select=${fields}&slug=eq.${encodeURIComponent(slug)}&status=eq.available&limit=1`;
  const response = await fetch(endpoint, { headers: { apikey: SUPABASE_KEY } });
  if (!response.ok) throw new Error(`Supabase respondeu ${response.status}`);
  const vehicles = await response.json();
  return vehicles[0] || null;
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).end();
  }

  const rawSlug = Array.isArray(request.query?.slug) ? request.query.slug[0] : request.query?.slug;
  const slug = cleanText(rawSlug).toLowerCase();
  response.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!/^[a-z0-9-]{1,180}$/.test(slug)) {
    return response.status(404).send(buildNotFoundPage());
  }

  try {
    const vehicle = await findVehicle(slug);
    if (!vehicle) return response.status(404).send(buildNotFoundPage());
    response.setHeader("Cache-Control", "public, max-age=60");
    response.setHeader("Vercel-CDN-Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
    return response.status(200).send(buildVehiclePage(vehicle));
  } catch (error) {
    console.error("Falha ao gerar página social do veículo:", error);
    return response.status(503).send(buildNotFoundPage());
  }
}

export { buildVehiclePage, vehicleDescription };
