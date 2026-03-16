// Fix script for app.tsx
const filePath = '../supabase/functions/server/app.tsx';

async function fixFile() {
  const content = await Deno.readTextFile(filePath);
  const lines = content.split('\n');
  
  // Line 5102 (index 5101) should only contain console.warn up to the semicolon
  const line5102 = lines[5101];
  const fixedLine5102 = line5102.substring(0, line5102.indexOf(');') + 2);
  lines[5101] = fixedLine5102;
  
  // Remove lines 5103-5120 (indices 5102-5119)  
  lines.splice(5102, 18);
  
  // Write back
  await Deno.writeTextFile(filePath, lines.join('\n'));
  console.log('✅ File fixed successfully');
}

fixFile().catch(console.error);
