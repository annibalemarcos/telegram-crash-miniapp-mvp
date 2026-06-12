const port = process.env.PORT || 3000;
const url = `http://localhost:${port}/api/health`;
try {
  const res = await fetch(url);
  const json = await res.json();
  console.log(json);
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error('Healthcheck falhou:', err.message);
  process.exit(1);
}
