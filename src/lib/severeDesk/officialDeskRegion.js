/**
 * A selected Place.admin1 picks one fixed desk region; the map viewport never
 * participates in source selection. Envelopes are derived from the U.S. Census
 * Bureau's 2024 1:500k cartographic state boundaries (GENZ2024). Alaska and
 * the territories are deliberately excluded until their antimeridian/coverage
 * contract is explicit; unsupported places fail closed.
 */
export const OFFICIAL_DESK_SETTLE_MS = 750

const REGION_ROWS = [
  ['Alabama', 'AL', -88.473227, 30.223334, -84.88908, 35.008028],
  ['Arizona', 'AZ', -114.81651, 31.332177, -109.045223, 37.00426],
  ['Arkansas', 'AR', -94.617919, 33.004291, -89.641003, 36.4996],
  ['California', 'CA', -124.409591, 32.534435, -114.131211, 42.009485],
  ['Colorado', 'CO', -109.060253, 36.992426, -102.041524, 41.003444],
  ['Connecticut', 'CT', -73.727775, 40.980144, -71.786994, 42.050587],
  ['Delaware', 'DE', -75.788658, 38.451196, -75.048939, 39.839007],
  ['District of Columbia', 'DC', -77.119759, 38.791645, -76.909395, 38.99511],
  ['Florida', 'FL', -87.634938, 24.521304, -80.031362, 31.000888],
  ['Georgia', 'GA', -85.605165, 30.357851, -80.840378, 35.001244],
  ['Idaho', 'ID', -117.243027, 41.988209, -111.043564, 49.000911],
  ['Illinois', 'IL', -91.513079, 36.970298, -87.495199, 42.508481],
  ['Indiana', 'IN', -88.097892, 37.771742, -84.784579, 41.760592],
  ['Iowa', 'IA', -96.638621, 40.375659, -90.140061, 43.501196],
  ['Kansas', 'KS', -102.051744, 36.993016, -94.588413, 40.003162],
  ['Kentucky', 'KY', -89.571509, 36.497129, -81.964971, 39.147458],
  ['Louisiana', 'LA', -94.043147, 28.928609, -88.817017, 33.019457],
  ['Maine', 'ME', -71.083924, 42.977764, -66.949895, 47.459686],
  ['Maryland', 'MD', -79.487651, 37.911717, -75.048939, 39.723043],
  ['Massachusetts', 'MA', -73.508142, 41.237964, -69.928393, 42.886589],
  ['Michigan', 'MI', -90.418136, 41.696118, -82.413474, 48.2388],
  ['Minnesota', 'MN', -97.239209, 43.499369, -89.493977, 49.384358],
  ['Mississippi', 'MS', -91.655009, 30.175372, -88.097888, 34.996052],
  ['Missouri', 'MO', -95.774704, 35.995683, -89.098843, 40.61364],
  ['Montana', 'MT', -116.049155, 44.357962, -104.039563, 49.00139],
  ['Nebraska', 'NE', -104.053514, 39.999998, -95.30829, 43.001708],
  ['Nevada', 'NV', -120.006455, 35.001857, -114.039648, 42.002207],
  ['New Hampshire', 'NH', -72.557247, 42.69699, -70.610621, 45.305476],
  ['New Jersey', 'NJ', -75.559537, 38.928519, -73.893628, 41.357423],
  ['New Mexico', 'NM', -109.050173, 31.332301, -103.001964, 37.000232],
  ['New York', 'NY', -79.762152, 40.496103, -71.856483, 45.01585],
  ['North Carolina', 'NC', -84.321869, 33.842316, -75.460621, 36.588117],
  ['North Dakota', 'ND', -104.0489, 45.935054, -96.554507, 49.000574],
  ['Ohio', 'OH', -84.820157, 38.403202, -80.518693, 41.977164],
  ['Oklahoma', 'OK', -103.002565, 33.615833, -94.430662, 37.002206],
  ['Oregon', 'OR', -124.566244, 41.991794, -116.463504, 46.290834],
  ['Pennsylvania', 'PA', -80.519891, 39.7198, -74.689516, 42.26986],
  ['Rhode Island', 'RI', -71.862772, 41.146339, -71.12057, 42.018798],
  ['South Carolina', 'SC', -83.35391, 32.037593, -78.547324, 35.215402],
  ['South Dakota', 'SD', -104.057879, 42.479635, -96.436589, 45.94545],
  ['Tennessee', 'TN', -90.310453, 34.982972, -81.6469, 36.678118],
  ['Texas', 'TX', -106.645646, 25.837377, -93.508292, 36.500704],
  ['Utah', 'UT', -114.052962, 36.997968, -109.041058, 42.001702],
  ['Vermont', 'VT', -73.43774, 42.726853, -71.464555, 45.016659],
  ['Virginia', 'VA', -83.675395, 36.540738, -75.242469, 39.466012],
  ['Washington', 'WA', -124.763068, 45.543541, -116.915989, 49.002494],
  ['West Virginia', 'WV', -82.644739, 37.201483, -77.719519, 40.638801],
  ['Wisconsin', 'WI', -92.888114, 42.491983, -86.805415, 47.080621],
  ['Wyoming', 'WY', -111.054556, 40.994746, -104.05216, 45.005815],
]

const REGIONS_BY_ADMIN1 = new Map(REGION_ROWS.flatMap(([name, code, west, south, east, north]) => {
  const region = Object.freeze({ areaCodes: Object.freeze([code]), bbox: Object.freeze({ west, south, east, north }) })
  return [[name.toLowerCase(), region], [code.toLowerCase(), region]]
}))

function isUsPlace(place) {
  const country = String(place?.country ?? '').trim().toLowerCase()
  return country === 'united states' || country === 'united states of america'
}

/**
 * Resolves an explicitly named, contiguous U.S. state-scale desk. We do not
 * infer a state from coordinates, include bordering states, or turn map
 * movement into an upstream query.
 */
export function resolveOfficialDeskRegion(place) {
  if (!isUsPlace(place)) return null
  return REGIONS_BY_ADMIN1.get(String(place?.admin1 ?? '').trim().toLowerCase()) ?? null
}
