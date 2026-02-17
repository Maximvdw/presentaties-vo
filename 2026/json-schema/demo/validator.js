import Ajv from 'https://esm.sh/ajv@8';
import addFormats from 'https://esm.sh/ajv-formats@2';

console.log('[demo] Module loaded');

const inputEl = document.getElementById('lucht-json-input');
const statusEl = document.getElementById('lucht-validation-status');
const errorsEl = document.getElementById('lucht-validation-errors');

if (!inputEl) {
  console.error('[demo] Input not found');
} else {
  try {
    let ajv;
    ajv = new Ajv({
      allErrors: true,
      strict: false,
      loadSchema: async (uri) => {
        console.log('[demo] loadSchema called for:', uri);
        const [baseUri, fragment] = uri.split('#');
        const isOpenGeospatial = baseUri.includes('opengeospatial');
        const isLocalSosa = baseUri.endsWith('/2026/json-schema/demo/sosa.json');

        // Load local SOSA schema for opengeospatial refs
        if (isOpenGeospatial || isLocalSosa) {
          console.log('[demo] Using local sosa.json for:', uri);
          const sosaRes = await fetch('/2026/json-schema/demo/sosa.json');
          if (!sosaRes.ok) throw new Error('sosa.json: ' + sosaRes.status);
          const sosaSchema = await sosaRes.json();
          return { ...sosaSchema, $id: baseUri };
        }

        const res = await fetch(baseUri);
        if (!res.ok) throw new Error('Status ' + res.status);
        return res.json();
      }
    });

    addFormats(ajv);
    console.log('[demo] Formats added');

    const res = await fetch('/2026/json-schema/demo/lucht.json');
    const luchtSchema = await res.json();
    console.log('[demo] Schema loaded');
    console.log('[demo] Starting compileAsync...');

    const validate = await ajv.compileAsync(luchtSchema);
    console.log('[demo] Compiled');

    statusEl.textContent = '✅ Geldig';
    statusEl.className = 'demo-status ok';

    inputEl.addEventListener('input', () => {
      try {
        const data = JSON.parse(inputEl.value);
        if (validate(data)) {
          statusEl.textContent = '✅ Geldig';
          statusEl.className = 'demo-status ok';
          errorsEl.innerHTML = '';
        } else {
          statusEl.textContent = '❌ Ongeldig';
          statusEl.className = 'demo-status err';
          errorsEl.innerHTML = validate.errors.map(e => 
            `<li>${e.instancePath || '/'} ${e.message}</li>`
          ).join('');
        }
      } catch (e) {
        statusEl.textContent = '❌ JSON';
        statusEl.className = 'demo-status err';
        errorsEl.innerHTML = `<li>${e.message}</li>`;
      }
    });
  } catch (e) {
    console.error('[demo]', e);
    statusEl.textContent = '❌ ' + e.message;
    statusEl.className = 'demo-status err';
  }
}
