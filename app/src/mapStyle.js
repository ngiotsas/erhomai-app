let cachedStyle = null;

async function loadStyle() {
  if (cachedStyle) return cachedStyle;
  const res = await fetch('https://tiles.openfreemap.org/styles/positron');
  cachedStyle = await res.json();
  return cachedStyle;
}

export async function createStyle(lang) {
  const style = JSON.parse(JSON.stringify(await loadStyle()));
  if (lang === 'el') return style;
  for (const layer of style.layers || []) {
    if (layer.layout && layer.layout['text-field']) {
      layer.layout['text-field'] = ['coalesce', ['get', 'name_en'], ['get', 'name']];
    }
  }
  return style;
}
