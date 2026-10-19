import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductionCard } from '../src/components/admin/ProductionCard';
import { checkProduction } from '../src/lib/api';
import type { AnyOrder } from '../src/types';

vi.mock('../src/lib/api', () => ({checkProduction:vi.fn(),saveProduction:vi.fn(),downloadPrintFile:vi.fn(),ApiError:class extends Error {}}));
it('visar FL-K och skiljer saknade filer från manuell betalningskontroll', async () => {
  const order = { id:'C-TEST',type:'custom',articleNumber:'FL-K-0001',projectName:'Testmodell',description:'Beskrivning',request:{material:'pla',quality:'standard',quantity:1,infill:20},quote:{estimatedPrintHours:2} } as AnyOrder;
  vi.mocked(checkProduction).mockResolvedValue({checkedAt:'2026-10-19',revision:0,checks:[
    {id:'files',label:'Modellfiler',status:'missing',detail:'Koppla rätt modellfil.'},
    {id:'payment',label:'Betalningskontroll',status:'review',detail:'Testläge: ingen betalning har genomförts.'},
  ]});
  render(<ProductionCard order={order} token="session" files={[]} onSaved={vi.fn()} />);
  await userEvent.click(screen.getByText('Produktionskort · filer och planering'));
  expect(screen.getByText('FL-K-0001')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Kontrollera produktionsunderlag'}));
  expect(await screen.findByText('Saknas: Modellfiler')).toBeInTheDocument();
  expect(screen.getByText('Kontrollera: Betalningskontroll')).toBeInTheDocument();
  expect(screen.getByText('Testläge: ingen betalning har genomförts.')).toBeInTheDocument();
  expect(checkProduction).toHaveBeenCalledWith('session','C-TEST');
});
