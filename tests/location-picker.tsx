import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import React, {useState} from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'HTMLInputElement']) {
  Object.defineProperty(globalThis, key, {value: (dom.window as any)[key], configurable: true});
}
Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
Object.assign(globalThis, {indexedDB, IS_REACT_ACT_ENVIRONMENT: true});
const {render, screen, cleanup, waitFor} = await import('@testing-library/react');
const user = (await import('@testing-library/user-event')).default.setup();
const {default: LocationPicker} = await import('../src/LocationPicker');
const {api, restoreBackup, getSyncSnapshot} = await import('../src/local-api');

const fixture = process.env.BACKUP_PATH ? JSON.parse(readFileSync(process.env.BACKUP_PATH, 'utf8')) : {
  items: [{id: 'item-1', name: 'Testverktyg', location: 'Trälåda 3', category: 'Handverktyg', quantity: 1, keywords: '', notes: '', photo: null, updated: '2026-10-25T00:00:00Z'}],
  places: ['Trälåda 27', 'Trälåda 3', 'Trälåda 2', 'Trälåda 1'].map((name, id) => ({id: 'place-' + id, name}))
};
await restoreBackup({items: fixture.items, places: fixture.places});
const before = await getSyncSnapshot();
const places = await api('/api/places');
let saved = false;

function Form({item}: {item?: any}) {
  const [location, setLocation] = useState(item?.location || '');
  return <form onSubmit={async e => {
    e.preventDefault();
    await api('/api/items', {method: 'POST', body: JSON.stringify(item ? {...item, location} : {
      name: 'Test av platsväljare', location, quantity: 1, category: 'Handverktyg', keywords: '', notes: ''
    })});
    saved = true;
  }}>
    <LocationPicker places={places} value={location} onChange={setLocation}/>
    <button>Spara</button>
  </form>;
}

render(<Form/>);
const select = screen.getByRole('combobox');
const labels = [...select.querySelectorAll('option')].map(x => x.textContent);
assert(labels.indexOf('Trälåda 2') < labels.indexOf('Trälåda 3'));
assert(labels.indexOf('Trälåda 3') < labels.indexOf('Trälåda 27'));
assert.equal((select as HTMLSelectElement).checkValidity(), false);
await user.selectOptions(select, 'new');
await user.type(screen.getByRole('textbox'), 'Avbruten plats');
cleanup();
assert.deepEqual(await getSyncSnapshot(), before, 'Opening/cancelling must not mutate inventory or pending sync');

render(<Form/>);
assert.equal((screen.getByRole('combobox') as HTMLSelectElement).value, '', 'New form must reset');
await user.selectOptions(screen.getByRole('combobox'), 'place:Trälåda 3');
await user.click(screen.getByRole('button', {name: 'Spara'}));
await waitFor(() => assert(saved));
let snapshot = await getSyncSnapshot();
assert.equal(snapshot.data.items.length, fixture.items.length + 1);
assert.equal(snapshot.data.places.length, fixture.places.length);
const added = snapshot.data.items.find(x => x.name === 'Test av platsväljare')!;
assert.equal(added.location, 'Trälåda 3');
assert(snapshot.pending.some(x => x.id === added.id && x.kind === 'item'));
cleanup();

saved = false;
render(<Form item={added}/>);
assert.equal((screen.getByRole('combobox') as HTMLSelectElement).value, 'place:Trälåda 3');
await user.selectOptions(screen.getByRole('combobox'), 'new');
assert.equal((screen.getByRole('textbox') as HTMLInputElement).checkValidity(), false);
await user.type(screen.getByRole('textbox'), 'Trälåda 99');
await user.click(screen.getByRole('button', {name: 'Spara'}));
await waitFor(() => assert(saved));
snapshot = await getSyncSnapshot();
assert.equal(snapshot.data.items.length, fixture.items.length + 1);
assert.equal(snapshot.data.items.find(x => x.id === added.id)?.location, 'Trälåda 99');
const place = snapshot.data.places.find(x => x.name === 'Trälåda 99')!;
assert(place);
assert(snapshot.pending.some(x => x.id === place.id && x.kind === 'location'));
assert.deepEqual(snapshot.data.items.filter(x => x.id !== added.id), fixture.items, 'All original items and photos must be unchanged');
assert.deepEqual(snapshot.data.places.filter(x => x.id !== place.id), fixture.places);
cleanup();

render(<Form item={{...added, location: 'Äldre plats utan platskort'}}/>);
assert.equal((screen.getByRole('combobox') as HTMLSelectElement).selectedOptions[0].textContent, 'Äldre plats utan platskort');
cleanup();
console.log(`PASS: selection, numeric ordering, cancel/reset, existing item, new place, sync queue, legacy location. Preserved ${fixture.items.length} items and ${fixture.places.length} places.`);
