import type { Language } from '../types';

/**
 * Czech versions of every message the API can return to a person.
 *
 * Route code keeps raising errors with English text (`badRequest('Item not
 * found')`); the error handler passes each message through `translateMessage`
 * using the language the client asked for (see middleware/language.ts). That keeps
 * the API contract and all call sites unchanged: English is the source and the
 * fallback, and anything not listed here is simply returned in English.
 *
 * messages.test.ts scans the route sources and fails if a new message is added
 * without a Czech counterpart.
 */

const EXACT_CS: Record<string, string> = {
  // generic / infrastructure
  'Unauthorized': 'Nejste oprávněni.',
  'Forbidden': 'Přístup odepřen.',
  'Not found': 'Nenalezeno.',
  'Not signed in': 'Nejste přihlášeni.',
  'Session expired, please sign in again': 'Platnost relace vypršela, přihlaste se prosím znovu.',
  'This account no longer exists': 'Tento účet už neexistuje.',
  'Your password was changed. Please sign in again.': 'Vaše heslo bylo změněno. Přihlaste se prosím znovu.',
  'This request came from an origin that is not allowed.': 'Tento požadavek pochází z nepovoleného zdroje.',
  'Too many attempts. Please wait a few minutes and try again.': 'Příliš mnoho pokusů. Chvíli počkejte a zkuste to znovu.',
  'That endpoint does not exist.': 'Tento koncový bod neexistuje.',
  'Something went wrong on our side. Please try again.': 'Něco se nepovedlo na naší straně. Zkuste to prosím znovu.',
  'The request body is not valid JSON.': 'Tělo požadavku není platný JSON.',
  'The request is too large.': 'Požadavek je příliš velký.',
  'The request could not be read.': 'Požadavek se nepodařilo přečíst.',
  'That already exists.': 'Takový záznam už existuje.',
  'That refers to something that no longer exists.': 'Odkazuje na něco, co už neexistuje.',
  'A required value is missing or invalid.': 'Chybí povinná hodnota nebo je neplatná.',
  'One of the values you entered is invalid.': 'Jedna ze zadaných hodnot je neplatná.',
  // images
  'That file could not be read as an image. Use a JPG, PNG, WebP or GIF.': 'Soubor se nepodařilo načíst jako obrázek. Použijte JPG, PNG, WebP nebo GIF.',
  'That image is larger than 5 MB. Choose a smaller one.': 'Obrázek je větší než 5 MB. Zvolte menší.',
  'The upload could not be processed. Choose a single image file.': 'Nahrání se nepodařilo zpracovat. Zvolte jediný obrázek.',
  'No image file was uploaded': 'Nebyl nahrán žádný obrázek.',
  'File must be an image': 'Soubor musí být obrázek.',
  'No avatar set': 'Profilový obrázek není nastaven.',
  'No image set': 'Obrázek není nastaven.',
  // account + auth
  'An account with that email already exists': 'Účet s tímto e-mailem již existuje.',
  'Email and password are required': 'Zadejte e-mail a heslo.',
  'Incorrect email or password': 'Nesprávný e-mail nebo heslo.',
  'A valid email is required': 'Zadejte platný e-mail.',
  'Current password is required': 'Zadejte současné heslo.',
  'Current password is incorrect': 'Současné heslo není správné.',
  'Choose a new password that is different from the current one': 'Zvolte nové heslo, které se liší od současného.',
  'Your password is required to delete your account': 'Ke smazání účtu je potřeba zadat heslo.',
  'Incorrect password': 'Nesprávné heslo.',
  'Language must be one of: en, cs': 'Jazyk musí být jeden z: en, cs.',
  'Currency must be one of: CZK, EUR, USD, GBP': 'Měna musí být jedna z: CZK, EUR, USD, GBP.',
  'Choose a language or a currency to save': 'Vyberte jazyk nebo měnu, které se mají uložit.',
  // email verification + recovery
  'Please confirm your email address to continue.': 'Pro pokračování potvrďte svou e-mailovou adresu.',
  'Please wait a moment before requesting another email.': 'Před dalším e-mailem chvíli počkejte.',
  'We could not send the email right now. Please try again in a minute.': 'E-mail se teď nepodařilo odeslat. Zkuste to prosím za chvíli.',
  'That code is not correct.': 'Tento kód není správný.',
  'That code has expired. Request a new one.': 'Platnost kódu vypršela. Vyžádejte si nový.',
  'Too many incorrect attempts. Request a new code.': 'Příliš mnoho nesprávných pokusů. Vyžádejte si nový kód.',
  'There is no active code. Request a new one.': 'Žádný platný kód neexistuje. Vyžádejte si nový.',
  'Enter the 6-digit code from the email.': 'Zadejte šestimístný kód z e-mailu.',
  'This reset link is invalid or has expired. Request a new one.': 'Tento odkaz pro obnovení je neplatný nebo mu vypršela platnost. Vyžádejte si nový.',
  // items
  'Location not found': 'Místo nebylo nalezeno.',
  'Category not found': 'Kategorie nebyla nalezena.',
  'Item not found': 'Předmět nebyl nalezen.',
  'The warranty end date cannot be before the purchase date': 'Konec záruky nemůže být před datem nákupu.',
  // item details
  'Quantity must be a whole number from 1 to 9999': 'Počet kusů musí být celé číslo od 1 do 9999.',
  'Tags must be a list of text values': 'Štítky musí být seznam textových hodnot.',
  'Tags cannot contain control characters': 'Štítky nesmí obsahovat řídicí znaky.',
  // bulk actions, files, saved filters
  'Choose at least one item': 'Vyberte alespoň jeden předmět.',
  'Choose where to move the items': 'Vyberte, kam se předměty přesunou.',
  'Choose a tag to add or remove': 'Vyberte štítek, který se má přidat nebo odebrat.',
  'Invalid paging': 'Neplatné stránkování.',
  'Invalid sort': 'Neplatné řazení.',
  'Invalid ids': 'Neplatné identifikátory.',
  'Photo not found': 'Fotografie nenalezena.',
  'Document not found': 'Dokument nenalezen.',
  'Saved filter not found': 'Uložený filtr nenalezen.',
  'No file was uploaded': 'Nebyl nahrán žádný soubor.',
  'Document type must be receipt, warranty, manual or other': 'Typ dokumentu musí být účtenka, záruka, návod nebo jiný.',
  'Only PDF files and images (JPG, PNG, WebP) can be attached': 'Přiložit lze jen soubory PDF a obrázky (JPG, PNG, WebP).',
  'A saved filter with that name already exists': 'Uložený filtr s tímto názvem už existuje.',
  'The filter is not valid': 'Filtr není platný.',
  'Set at least one filter before saving': 'Před uložením nastavte alespoň jeden filtr.',
  'Minimum value is higher than maximum value': 'Minimální hodnota je vyšší než maximální.',
  'Choose a currency to filter by value': 'Pro filtrování podle hodnoty vyberte měnu.',
  'Invalid status filter': 'Neplatný filtr stavu.',
  'Invalid currency filter': 'Neplatný filtr měny.',
  'Invalid archived filter': 'Neplatný filtr odebraných předmětů.',
  'Invalid warranty filter': 'Neplatný filtr záruky.',
  'Search must be text': 'Hledaný text musí být text.',
  '"Purchased from" is after "Purchased to"': '„Zakoupeno od“ je později než „Zakoupeno do“.',
  'Reminders setting must be true or false': 'Nastavení upozornění musí být zapnuto nebo vypnuto.',
  // households
  'Invalid id': 'Neplatný identifikátor.',
  'Sharing setting must be true or false': 'Nastavení sdílení musí být ano nebo ne.',
  'Enter the invitation code': 'Zadejte kód pozvánky.',
  'That invitation code is not valid': 'Tento kód pozvánky není platný.',
  'You are already in a household': 'Už jste členem domácnosti.',
  'This household is full': 'Tato domácnost je plná.',
  'Only the owner of the household can do this': 'Může to udělat jen vlastník domácnosti.',
  'Invitation not found': 'Pozvánka nenalezena.',
  'You are not in a household': 'Nejste členem žádné domácnosti.',
  'Remove the other members first, or delete the household': 'Nejdřív odeberte ostatní členy, nebo domácnost smažte.',
  'You cannot remove yourself; leave or delete the household instead': 'Sami sebe odebrat nemůžete; domácnost opusťte nebo smažte.',
  'Member not found': 'Člen nenalezen.',
  'Choose a feedback category': 'Vyberte kategorii zpětné vazby.',
  'Write your feedback first': 'Nejdřív napište svou zpětnou vazbu.',
  'Feedback must be at least 10 characters long': 'Zpětná vazba musí mít alespoň 10 znaků.',
  'Feedback must be 4000 characters or fewer': 'Zpětná vazba může mít nejvýše 4000 znaků.',
  'You have sent a lot of feedback today. Please try again tomorrow.': 'Dnes jste poslali hodně zpětné vazby. Zkuste to prosím zítra.',
  'Household name is required': 'Název domácnosti je povinný.',
  // item import (account/import.ts, routes/items.routes.ts); messages with a number or a name inside stay English
  'The warranty end date is before the purchase date': 'Konec záruky je před datem nákupu.',
  'A location name is longer than 100 characters': 'Název místa je delší než 100 znaků.',
  'content (the file text) is required': 'Chybí obsah souboru.',
  'The file is empty.': 'Soubor je prázdný.',
  'The file looks like JSON but cannot be read.': 'Soubor vypadá jako JSON, ale nelze ho přečíst.',
  'This JSON is not a Kepo export or a list of items.': 'Tento JSON není export z Kepa ani seznam předmětů.',
  'The export has no list of items.': 'Export neobsahuje seznam předmětů.',
  'The file contains no items.': 'Soubor neobsahuje žádné předměty.',
  'The file needs a header row and at least one item.': 'Soubor potřebuje řádek záhlaví a alespoň jeden předmět.',
  'The header must contain a "name" column.': 'Záhlaví musí obsahovat sloupec „name“.',
  'A quoted value is not closed (missing closing ").': 'Hodnota v uvozovkách není ukončena (chybí závěrečná uvozovka).',
  'To mark an item as borrowed, add it first and then use Lend.': 'Chcete-li předmět označit jako půjčený, nejprve ho přidejte a poté použijte Půjčit.',
  'To mark an item as borrowed, use Lend.': 'Chcete-li předmět označit jako půjčený, použijte Půjčit.',
  'This item is currently borrowed. Return it before changing its status.': 'Tento předmět je právě půjčený. Před změnou stavu ho vraťte.',
  'locationId is required': 'Je potřeba zadat místo.',
  'This item already has an active loan. Return it before lending it again.': 'Tento předmět je už půjčený. Před dalším půjčením ho vraťte.',
  'This item has no active loan to edit': 'Tento předmět nemá žádnou aktivní půjčku k úpravě.',
  'This item has no active loan to return': 'Tento předmět nemá žádnou aktivní půjčku k vrácení.',
  // locations
  'A place with that name already exists here.': 'Místo s tímto názvem tu už existuje.',
  'Parent location not found': 'Nadřazené místo nebylo nalezeno.',
  'A place cannot be inside itself.': 'Místo nemůže být samo v sobě.',
  'A place cannot be moved inside one of its own sub-places.': 'Místo nelze přesunout dovnitř jeho vlastního podřazeného místa.',
  'Choose a different place to move the items to.': 'Zvolte jiné místo, kam se předměty přesunou.',
  'Destination location not found': 'Cílové místo nebylo nalezeno.',
};

/** Names of the fields that appear in validation messages. */
const LABELS_CS: Record<string, string> = {
  'Name': 'Jméno',
  'Item name': 'Název předmětu',
  'Location name': 'Název místa',
  'Borrower name': 'Jméno vypůjčitele',
  'Description': 'Popis',
  'Photo link': 'Odkaz na fotku',
  'Value': 'Hodnota',
  'Serial number': 'Sériové číslo',
  'Password': 'Heslo',
  'New password': 'Nové heslo',
  'Purchase date': 'Datum nákupu',
  'Warranty end date': 'Konec záruky',
  'Expected return date': 'Očekávané vrácení',
  'item id': 'ID předmětu',
  'location id': 'ID místa',
  'id': 'ID',
  'categoryId': 'kategorie',
  'locationId': 'místo',
  'parentId': 'nadřazené místo',
  'moveItemsTo': 'cíl přesunu',
};

const STATUS_CS: Record<string, string> = {
  with_me: 'Se mnou',
  stored: 'Uložené',
  borrowed: 'Půjčené',
  lost: 'Ztracené',
  sold: 'Prodané',
  disposed: 'Vyřazené',
};

const label = (raw: string) => LABELS_CS[raw] ?? raw;
const quoted = (raw: string) => `„${label(raw)}“`;

/** Czech plural of "předmět" for a count. */
function itemsCs(n: number): string {
  if (n === 1) return '1 předmět';
  if (n >= 2 && n <= 4) return `${n} předměty`;
  return `${n} předmětů`;
}

const PATTERNS_CS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(.+) is required$/, m => `Pole ${quoted(m[1])} je povinné.`],
  [/^(.+) must be (\d+) characters or fewer$/, m => `Pole ${quoted(m[1])} může mít nejvýše ${m[2]} znaků.`],
  [/^(.+) must be at least (\d+) characters$/, m => `Pole ${quoted(m[1])} musí mít alespoň ${m[2]} znaků.`],
  [/^(.+) must be (\d+) bytes or fewer$/, m => `Pole ${quoted(m[1])} může mít nejvýše ${m[2]} bajtů.`],
  [/^(.+) must be text$/, m => `Pole ${quoted(m[1])} musí být text.`],
  [/^(.+) must be a valid date$/, m => `Pole ${quoted(m[1])} musí obsahovat platné datum.`],
  [/^(.+) must be a valid web address$/, m => `Pole ${quoted(m[1])} musí být platná webová adresa.`],
  [/^(.+) must start with http:\/\/ or https:\/\/$/, m => `Pole ${quoted(m[1])} musí začínat na http:// nebo https://.`],
  [
    /^(.+) must be a number between 0 and ([\d,.]+)$/,
    m => `Pole ${quoted(m[1])} musí být číslo mezi 0 a ${Number(m[2].replace(/,/g, '')).toLocaleString('cs-CZ')}.`,
  ],
  [/^Status must be one of: (.+)$/, m => `Stav musí být jedna z hodnot: ${m[1]}.`],
  [
    /^This item is marked as (\w+)\. Change its status before lending it\.$/,
    m => `Tento předmět má stav „${STATUS_CS[m[1]] ?? m[1]}“. Před půjčením změňte jeho stav.`,
  ],
  [
    /^(.+) still holds (\d+) items?\. Choose where to move (?:it|them) first\.$/,
    m => `Místo „${m[1]}“ stále obsahuje ${itemsCs(Number(m[2]))}. Nejprve vyberte, kam je přesunout.`,
  ],
  [/^Invalid (.+)$/, m => `Neplatná hodnota: ${label(m[1])}.`],
];

/** Returns `message` in the requested language, or unchanged when no translation exists. */
export function translateMessage(message: string, lang: Language): string {
  if (lang !== 'cs') return message;
  const exact = EXACT_CS[message];
  if (exact) return exact;
  for (const [pattern, build] of PATTERNS_CS) {
    const match = message.match(pattern);
    if (match) return build(match);
  }
  return message;
}

/** Exposed for the completeness test. */
export const translatedMessages = (): string[] => Object.keys(EXACT_CS);
