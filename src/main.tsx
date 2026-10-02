import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { store } from './data/store';
import './index.css';

const root = createRoot(document.getElementById('root')!);

void store.initialize().then(
  () => root.render(<App />),
  (error: unknown) => {
    console.error('Could not initialize the app data store:', error);
    root.render(
      <main className="mx-auto max-w-xl p-8 text-center font-sans">
        <h1 className="text-xl font-bold text-red-700">Could not load shared demo data</h1>
        <p className="mt-3 text-slate-700">
          Check the Supabase settings in Vercel and redeploy the project.
        </p>
      </main>,
    );
  },
);
