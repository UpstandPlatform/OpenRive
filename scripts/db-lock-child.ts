import { database } from '@openrive/db';

const hold = process.argv[2] === 'hold';
try {
  const connection = await database();
  if (hold) {
    console.log('LOCKED');
    await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
  } else {
    console.log('OPENED');
  }
  await connection.close();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 2;
}
