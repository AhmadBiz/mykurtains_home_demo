import { Header } from './ui/Header';
import { HouseModel } from './scene/HouseModel';
import { SidePanel } from './ui/SidePanel';
import './ui/layout.css';

/**
 * Page layout: header (house name, address, storey tabs, language) / stage with the glass model /
 * side panel (overview of every window, or the selected window's covering picker).
 * On phones the panel stacks under the model.
 */
export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="layout">
        <section className="stage" aria-label="Maquette de la maison">
          <HouseModel />
        </section>
        <SidePanel />
      </main>
    </div>
  );
}
