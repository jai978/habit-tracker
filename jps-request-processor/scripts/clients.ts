/**
 * Client admin from the terminal, for when the dashboard is not to hand.
 *
 *   npm run clients -- list
 *   npm run clients -- add --name "ABC Roofing" --sender-id 1234567890 --url https://abcroofing.co.nz
 *   npm run clients -- set-context <client-id> ./abc-roofing-context.md
 */
import { existsSync, readFileSync } from 'node:fs';

import { loadConfig } from '../src/config.ts';
import { createStore } from '../src/db/index.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

function flag(argv: string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const store = createStore(loadConfig());
  await store.migrate();

  switch (command) {
    case 'list': {
      const clients = await store.clients.list();
      if (clients.length === 0) {
        console.log('No clients yet.');
        break;
      }
      for (const client of clients) {
        console.log(
          [
            client.business_name,
            `  id:        ${client.id}`,
            `  sender:    ${client.facebook_sender_id}`,
            `  website:   ${client.website_url ?? '—'}`,
            `  lovable:   ${client.lovable_project_reference ?? '—'}`,
            `  active:    ${client.active}`,
            `  context:   ${client.site_context ? `${client.site_context.length} chars` : 'none'}`,
          ].join('\n'),
        );
      }
      break;
    }

    case 'add': {
      const name = flag(rest, 'name');
      const senderId = flag(rest, 'sender-id');
      if (!name || !senderId) {
        console.error('Usage: clients add --name "Business" --sender-id <facebook-id> [--url ...] [--lovable ...]');
        process.exitCode = 1;
        break;
      }
      const created = await store.clients.create({
        business_name: name,
        facebook_sender_id: senderId,
        website_url: flag(rest, 'url'),
        lovable_project_reference: flag(rest, 'lovable'),
      });
      console.log(`Created ${created.business_name} (${created.id})`);
      break;
    }

    case 'set-context': {
      const [id, file] = rest;
      if (!id || !file) {
        console.error('Usage: clients set-context <client-id> <file>');
        process.exitCode = 1;
        break;
      }
      const updated = await store.clients.update(id, { site_context: readFileSync(file, 'utf8') });
      console.log(updated ? `Updated site context for ${updated.business_name}` : 'No such client');
      break;
    }

    default:
      console.error('Commands: list | add | set-context');
      process.exitCode = 1;
  }

  await store.close();
}

await main();
