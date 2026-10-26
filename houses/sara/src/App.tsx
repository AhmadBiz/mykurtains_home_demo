import { Header } from './ui/Header';
import { HouseModel } from './scene/HouseModel';
import { SidePanel } from './ui/SidePanel';
import { useT } from './store/useStore';
import './ui/layout.css';

/**
 * Page layout: header (house name, address, storey tabs, language) / stage with the glass model /
 * side panel (overview of every window, or the selected window's covering picker).
 * On phones the panel stacks under the model.
 */
export default function App() {
  const t = useT();
  return (
    <div className="app">
      <Header />
      <main className="layout">
        <section className="stage" aria-label={t('Maquette de la maison', 'House model')}>
          <HouseModel />
        </section>
        <SidePanel />
      </main>
    </div>
  );
}
