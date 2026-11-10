const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const User = require('../models/User');

function ask(question) {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    prompt.question(question, (answer) => {
      prompt.close();
      resolve(answer.trim());
    });
  });
}

function askPassword(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal to enter the password securely.'));
  }

  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let password = '';

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };

    const onData = (input) => {
      for (const character of input.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Admin setup cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(password);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1);
        } else if (character >= ' ') {
          password += character;
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

async function createAdmin() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set. Configure it in backend/.env before running this command.');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  try {
    if (await User.exists({ role: 'admin' })) {
      throw new Error('An admin account already exists. This setup command only creates the first admin.');
    }

    const name = await ask('Admin full name: ');
    const email = (await ask('Admin email: ')).toLowerCase();

    if (!name) {
      throw new Error('Name is required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address.');
    }

    const password = await askPassword('Admin password (hidden): ');
    const passwordConfirmation = await askPassword('Confirm password (hidden): ');

    if (password.length < 12) {
      throw new Error('Use a password with at least 12 characters.');
    }
    if (password !== passwordConfirmation) {
      throw new Error('Passwords do not match.');
    }
    if (await User.exists({ email })) {
      throw new Error('An account with that email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      status: 'approved',
    });

    console.log(`Admin account created for ${email}. You can now sign in.`);
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin().catch((error) => {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
});
