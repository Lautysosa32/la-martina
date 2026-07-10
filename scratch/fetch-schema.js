import fetch from 'node-fetch';

async function run() {
  const url = 'https://oczxbflkvutumcflnwlx.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jenhiZmxrdnV0dW1jZmxud2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MTIyMDcsImV4cCI6MjA2NDA4ODIwN30.ZpB_xKjW7W3w6w8o_h1o9T9pP1Q6_W7u1v8e6Y2f8Dk';
  const res = await fetch(url);
  const data = await res.json();
  console.log('Columns for cash_closes:');
  console.log(Object.keys(data.definitions.cash_closes.properties));
}

run();
