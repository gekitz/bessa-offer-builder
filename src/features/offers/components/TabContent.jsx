import CatGroup from './CatGroup';

function groupBy(items, key) {
  const g = {};
  items.forEach(i => {
    const k = i[key] || 'Sonstige';
    (g[k] = g[k] || []).push(i);
  });
  return g;
}

export default function TabContent({ items, cart, globalTier, handlers }) {
  const groups = groupBy(items, 'cat');
  return (
    <div>
      {Object.entries(groups).map(([cat, list]) => (
        <CatGroup key={cat} title={cat} items={list} cart={cart} globalTier={globalTier} handlers={handlers} />
      ))}
    </div>
  );
}
