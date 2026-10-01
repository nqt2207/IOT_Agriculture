import * as bcrypt from 'bcryptjs';

async function main() {
  const password = 'XYZD123@';

  // Hash password với salt rounds = 10
  const hash = await bcrypt.hash(password, 10);

  console.log(hash);
}

main();