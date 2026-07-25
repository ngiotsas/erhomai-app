import baseStyle from './positron.json';

function transformLabels(style, expression) {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
        return {
          ...layer,
          layout: { ...layer.layout, 'text-field': expression },
        };
      }
      return layer;
    }),
  };
}

export function createStyle(lang) {
  if (lang === 'en') {
    return transformLabels(baseStyle, [
      'case',
      ['has', 'name:nonlatin'],
      ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
      ['coalesce', ['get', 'name_en'], ['get', 'name']],
    ]);
  }
  return transformLabels(baseStyle, [
    'case',
    ['has', 'name:nonlatin'],
    ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
    ['get', 'name'],
  ]);
}
