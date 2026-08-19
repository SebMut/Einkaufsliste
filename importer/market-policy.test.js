import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedMarket, isRiemArcaden, marketArea } from './market-policy.js';

const yes = [
  ['Feldkirchen', 'Kapellenstraße 16b, 85622 Feldkirchen'],
  ['Aschheim', 'Ohmstraße 5, 85609 Aschheim'],
  ['Heimstetten', 'Räterstraße 24, 85551 Kirchheim-Heimstetten'],
  ['Kirchheim', 'Fraunhoferstraße 2, 85551 Kirchheim'],
  ['Riem Arcaden', 'Willy-Brandt-Platz 5, 81829 München']
];
for (const [name,address] of yes) test(`${name} ist erlaubt`, () => assert.equal(isAllowedMarket({market:name,address}), true));

const no = [
  ['Haar','Am See 13, 85540 Haar'],
  ['Vaterstetten','Bahnhofstraße 36, 85591 Vaterstetten'],
  ['Parsdorf','Am Lerchenfeld 3, 85599 Vaterstetten'],
  ['Poing','Schwanenstraße 1, 85586 Poing'],
  ['Trudering','Truderinger Straße 190, 81825 München'],
  ['München-Freimann','Helene-Wessel-Bogen 39, 80939 München'],
  ['München-Berg am Laim','Neumarkter Straße 64, 81673 München'],
  ['Riem außerhalb Arcaden','Elisabeth-Castonier-Platz 25, 81829 München']
];
for (const [name,address] of no) test(`${name} ist gesperrt`, () => assert.equal(isAllowedMarket({market:name,address}), false));

test('Riem Arcaden ist nur an der belegten Arcaden-Adresse aktiv', () => {
  assert.equal(isRiemArcaden({address:'Willy-Brandt-Platz 5, 81829 München'}), true);
  assert.equal(isRiemArcaden({address:'Lehrer-Wirth-Straße 15, 81829 München'}), false);
  assert.equal(marketArea({market:'München-Riem',address:'Lehrer-Wirth-Straße 15, 81829 München'}), null);
});

test('explizites isRiemArcaden darf belastbar verifizierte Datensätze zulassen', () => {
  assert.equal(isAllowedMarket({market:'Riem',address:'Willy-Brandt-Platz 5, 81829 München',isRiemArcaden:true}), true);
});
