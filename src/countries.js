// Familiar flags first (editorial order), then the rest by English display name.
// Codes are ISO 3166-1 alpha-2 except for Kosovo's user-assigned XK.
const countryRows = [
  ['US', 'United States', 'USA', 'United States of America', 'America', 'The United States'],
  ['GB', 'United Kingdom', 'UK', 'Great Britain', 'Britain', 'The United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'],
  ['CA', 'Canada'],
  ['JP', 'Japan'],
  ['FR', 'France'],
  ['DE', 'Germany', 'Deutschland'],
  ['IT', 'Italy', 'Italia'],
  ['BR', 'Brazil', 'Brasil'],
  ['CN', 'China', 'PRC', 'People’s Republic of China'],
  ['IN', 'India', 'Bharat'],
  ['AU', 'Australia'],
  ['MX', 'Mexico'],
  ['ES', 'Spain', 'España'],
  ['KR', 'South Korea', 'Republic of Korea', 'ROK'],
  ['ZA', 'South Africa', 'Republic of South Africa'],
  ['AR', 'Argentina'],
  ['CH', 'Switzerland', 'Swiss Confederation'],
  ['SE', 'Sweden', 'Sverige'],
  ['NL', 'Netherlands', 'The Netherlands', 'Holland', 'Kingdom of the Netherlands'],
  ['NZ', 'New Zealand', 'Aotearoa'],
  ['GR', 'Greece', 'Hellas', 'Hellenic Republic'],
  ['RU', 'Russia', 'Russian Federation'],
  ['TR', 'Türkiye', 'Turkey', 'Republic of Türkiye'],
  ['EG', 'Egypt'],
  ['IE', 'Ireland', 'Republic of Ireland', 'Éire'],
  ['PT', 'Portugal'],
  ['NO', 'Norway'],
  ['DK', 'Denmark'],
  ['FI', 'Finland', 'Suomi'],
  ['UA', 'Ukraine'],
  ['PL', 'Poland'],
  ['BE', 'Belgium'],
  ['AT', 'Austria', 'Österreich'],
  ['TH', 'Thailand', 'Siam'],
  ['VN', 'Vietnam', 'Viet Nam'],
  ['ID', 'Indonesia'],
  ['PH', 'Philippines', 'The Philippines'],
  ['PK', 'Pakistan'],
  ['SA', 'Saudi Arabia', 'Kingdom of Saudi Arabia'],
  ['AE', 'United Arab Emirates', 'UAE', 'The Emirates'],
  ['IL', 'Israel'],
  ['KE', 'Kenya'],
  ['NG', 'Nigeria'],
  ['MA', 'Morocco'],
  ['CL', 'Chile'],
  ['CO', 'Colombia'],
  ['PE', 'Peru'],
  ['JM', 'Jamaica'],
  ['CU', 'Cuba'],
  ['IS', 'Iceland', 'Ísland'],

  ['AF', 'Afghanistan'],
  ['AL', 'Albania'],
  ['DZ', 'Algeria'],
  ['AD', 'Andorra'],
  ['AO', 'Angola'],
  ['AG', 'Antigua and Barbuda'],
  ['AM', 'Armenia'],
  ['AZ', 'Azerbaijan'],
  ['BS', 'Bahamas', 'The Bahamas'],
  ['BH', 'Bahrain'],
  ['BD', 'Bangladesh'],
  ['BB', 'Barbados'],
  ['BY', 'Belarus'],
  ['BZ', 'Belize'],
  ['BJ', 'Benin', 'Dahomey'],
  ['BT', 'Bhutan'],
  ['BO', 'Bolivia', 'Plurinational State of Bolivia'],
  ['BA', 'Bosnia and Herzegovina', 'Bosnia', 'Bosnia-Herzegovina'],
  ['BW', 'Botswana'],
  ['BN', 'Brunei', 'Brunei Darussalam'],
  ['BG', 'Bulgaria'],
  ['BF', 'Burkina Faso', 'Upper Volta'],
  ['BI', 'Burundi'],
  ['CV', 'Cabo Verde', 'Cape Verde'],
  ['KH', 'Cambodia', 'Kampuchea'],
  ['CM', 'Cameroon', 'Cameroun'],
  ['CF', 'Central African Republic', 'CAR'],
  ['TD', 'Chad', 'Tchad'],
  ['KM', 'Comoros'],
  ['CR', 'Costa Rica'],
  ['CI', 'Côte d’Ivoire', 'Ivory Coast', 'Cote d Ivoire'],
  ['HR', 'Croatia', 'Hrvatska'],
  ['CY', 'Cyprus'],
  ['CZ', 'Czechia', 'Czech Republic'],
  ['CD', 'Democratic Republic of the Congo', 'DR Congo', 'DRC', 'DR of Congo', 'Congo-Kinshasa', 'Zaire'],
  ['DJ', 'Djibouti'],
  ['DM', 'Dominica'],
  ['DO', 'Dominican Republic'],
  ['EC', 'Ecuador'],
  ['SV', 'El Salvador'],
  ['GQ', 'Equatorial Guinea'],
  ['ER', 'Eritrea'],
  ['EE', 'Estonia'],
  ['SZ', 'Eswatini', 'Swaziland', 'Kingdom of Eswatini'],
  ['ET', 'Ethiopia'],
  ['FJ', 'Fiji'],
  ['GA', 'Gabon'],
  ['GM', 'Gambia', 'The Gambia', 'Republic of The Gambia'],
  ['GE', 'Georgia'],
  ['GH', 'Ghana'],
  ['GD', 'Grenada'],
  ['GT', 'Guatemala'],
  ['GN', 'Guinea', 'Guinea-Conakry'],
  ['GW', 'Guinea-Bissau'],
  ['GY', 'Guyana'],
  ['HT', 'Haiti', 'Ayiti'],
  ['HN', 'Honduras'],
  ['HU', 'Hungary', 'Magyarország'],
  ['IR', 'Iran', 'Islamic Republic of Iran', 'Persia'],
  ['IQ', 'Iraq'],
  ['JO', 'Jordan'],
  ['KZ', 'Kazakhstan'],
  ['KI', 'Kiribati'],
  ['XK', 'Kosovo', 'Republic of Kosovo', 'Kosova'],
  ['KW', 'Kuwait'],
  ['KG', 'Kyrgyzstan', 'Kyrgyz Republic', 'Kirghizstan'],
  ['LA', 'Laos', 'Lao PDR', 'Lao People’s Democratic Republic'],
  ['LV', 'Latvia'],
  ['LB', 'Lebanon'],
  ['LS', 'Lesotho'],
  ['LR', 'Liberia'],
  ['LY', 'Libya'],
  ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['MG', 'Madagascar'],
  ['MW', 'Malawi'],
  ['MY', 'Malaysia'],
  ['MV', 'Maldives', 'The Maldives'],
  ['ML', 'Mali'],
  ['MT', 'Malta'],
  ['MH', 'Marshall Islands', 'The Marshall Islands'],
  ['MR', 'Mauritania'],
  ['MU', 'Mauritius'],
  ['FM', 'Micronesia', 'Federated States of Micronesia', 'FSM'],
  ['MD', 'Moldova', 'Republic of Moldova'],
  ['MC', 'Monaco'],
  ['MN', 'Mongolia'],
  ['ME', 'Montenegro'],
  ['MZ', 'Mozambique', 'Moçambique'],
  ['MM', 'Myanmar', 'Burma'],
  ['NA', 'Namibia'],
  ['NR', 'Nauru', 'Naoero'],
  ['NP', 'Nepal'],
  ['NI', 'Nicaragua'],
  ['NE', 'Niger'],
  ['KP', 'North Korea', 'DPRK', 'Democratic People’s Republic of Korea'],
  ['MK', 'North Macedonia', 'Republic of North Macedonia', 'Macedonia', 'FYROM'],
  ['OM', 'Oman'],
  ['PW', 'Palau', 'Belau'],
  ['PS', 'Palestine', 'State of Palestine'],
  ['PA', 'Panama'],
  ['PG', 'Papua New Guinea', 'PNG'],
  ['PY', 'Paraguay'],
  ['QA', 'Qatar'],
  ['CG', 'Republic of the Congo', 'Congo', 'Republic of Congo', 'Congo-Brazzaville'],
  ['RO', 'Romania'],
  ['RW', 'Rwanda'],
  ['KN', 'Saint Kitts and Nevis', 'St Kitts and Nevis'],
  ['LC', 'Saint Lucia', 'St Lucia'],
  ['VC', 'Saint Vincent and the Grenadines', 'St Vincent and the Grenadines'],
  ['WS', 'Samoa', 'Western Samoa'],
  ['SM', 'San Marino'],
  ['ST', 'São Tomé and Príncipe', 'São Tomé e Príncipe'],
  ['SN', 'Senegal'],
  ['RS', 'Serbia'],
  ['SC', 'Seychelles'],
  ['SL', 'Sierra Leone'],
  ['SG', 'Singapore', 'Singapura'],
  ['SK', 'Slovakia', 'Slovak Republic'],
  ['SI', 'Slovenia'],
  ['SB', 'Solomon Islands', 'The Solomon Islands'],
  ['SO', 'Somalia'],
  ['SS', 'South Sudan'],
  ['LK', 'Sri Lanka', 'Ceylon'],
  ['SD', 'Sudan'],
  ['SR', 'Suriname'],
  ['SY', 'Syria', 'Syrian Arab Republic'],
  ['TW', 'Taiwan', 'Republic of China', 'ROC', 'Chinese Taipei'],
  ['TJ', 'Tajikistan'],
  ['TZ', 'Tanzania', 'United Republic of Tanzania'],
  ['TL', 'Timor-Leste', 'East Timor'],
  ['TG', 'Togo'],
  ['TO', 'Tonga'],
  ['TT', 'Trinidad and Tobago'],
  ['TN', 'Tunisia', 'Tunisie'],
  ['TM', 'Turkmenistan'],
  ['TV', 'Tuvalu'],
  ['UG', 'Uganda'],
  ['UY', 'Uruguay'],
  ['UZ', 'Uzbekistan'],
  ['VU', 'Vanuatu'],
  ['VA', 'Vatican City', 'Holy See', 'Vatican', 'Vatican City State'],
  ['VE', 'Venezuela', 'Bolivarian Republic of Venezuela'],
  ['YE', 'Yemen'],
  ['ZM', 'Zambia'],
  ['ZW', 'Zimbabwe'],
];

export const countries = Object.freeze(countryRows.map(([code, name, ...aliases]) =>
  Object.freeze({ code, name, aliases: Object.freeze(aliases), flag: `assets/flags/${code.toLowerCase()}.svg` }),
));

// UN M49 geographic groupings: https://unstats.un.org/unsd/methodology/m49/overview/
// North America includes Central America and the Caribbean. The app also
// includes Taiwan in Asia and Kosovo in Europe, independently of M49 listings.
const continentGroups = [
  ['africa', 'Africa', 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW'],
  ['asia', 'Asia', 'AE AF AM AZ BD BH BN BT CN CY GE ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE'],
  ['europe', 'Europe', 'AD AL AT BA BE BG BY CH CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK'],
  ['north-america', 'North America', 'AG BB BS BZ CA CR CU DM DO GD GT HN HT JM KN LC MX NI PA SV TT US VC'],
  ['oceania', 'Oceania', 'AU FJ FM KI MH NR NZ PG PW SB TO TV VU WS'],
  ['south-america', 'South America', 'AR BO BR CL CO EC GY PE PY SR UY VE'],
];
export const regions = Object.freeze([['world', 'World'], ...continentGroups].map(([id, label]) =>
  Object.freeze({ id, label }),
));
const byRegion = new Map([['world', countries]]);
for (const [id, , codes] of continentGroups) {
  const set = new Set(codes.split(' '));
  byRegion.set(id, Object.freeze(countries.filter(country => set.has(country.code))));
}
export const countriesIn = region => byRegion.get(region) ?? countries;

function normalize(text) {
  const folded = text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '');
  if (!/[\p{L}\p{N}]/u.test(folded)) return '';
  const normalized = folded
    .replace(/['‘’ʼ]/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  // Collapse separated initials (for example U.S.A. or D R C).
  return /^(?:[a-z] ){1,}[a-z]$/u.test(normalized) ? normalized.replaceAll(' ', '') : normalized;
}

const searchIndex = countries.map((country, order) => ({
  country,
  order,
  code: normalize(country.code),
  name: normalize(country.name),
  aliases: country.aliases.map(normalize),
}));

export function resolveCountry(query) {
  const needle = typeof query === 'string' ? normalize(query) : '';
  if (!needle) return null;
  const matches = searchIndex.filter(({ code, name, aliases }) =>
    code === needle || name === needle || aliases.includes(needle));
  return matches.length === 1 ? matches[0].country : null;
}

function matchRank(text, query) {
  if (text === query) return 0;
  if (text.startsWith(query)) return 2;
  if (text.includes(` ${query}`)) return 4;
  if (text.includes(query)) return 6;
  return Infinity;
}

export function searchCountries(query) {
  const needle = typeof query === 'string' ? normalize(query) : '';
  if (!needle) return [];

  const matches = [];
  for (const entry of searchIndex) {
    let rank = matchRank(entry.name, needle);
    if (entry.code === needle) rank = Math.min(rank, 1);
    for (const alias of entry.aliases) rank = Math.min(rank, matchRank(alias, needle) + 1);
    if (Number.isFinite(rank)) matches.push({ entry, rank });
  }
  matches.sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order);
  return matches.map(({ entry }) => entry.country);
}
