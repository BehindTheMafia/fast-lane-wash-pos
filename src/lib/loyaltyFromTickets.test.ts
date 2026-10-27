import { describe, it, expect } from 'vitest';
import { loyaltyFromTickets, type LoyaltyTicket } from './loyaltyFromTickets';
import type { LoyaltyProgram, LoyaltyReward } from '@/hooks/useLoyaltyV3';
const programs: LoyaltyProgram[] = ['premium','nitido'].map((slug,i) => ({id:i+1,name:slug,slug,cycle_size:9,active:true,
 rewards:[{at:5,options:[{reward:'Gratis',reward_slug:'free',service_name_like:'Lavado',discount_percent:100,target_service_slug:null}]}]}));
const ticket = (id:number, name='Premium', overrides={}) => ({id,customer_id:1,created_at:`2026-01-${String(id).padStart(2,'0')}T12:00:00Z`,status:'paid',business_line:'car_wash',ticket_number:`T-${id}`,
 ticket_items:[{service_id:1,item_type:'service',service_name_snapshot:name,services:{name,is_extra:false}}],...overrides}) as LoyaltyTicket;
const reward = (id:number, ticket_id:number|null, overrides={}) => ({id,customer_id:1,program_id:1,reward_name:'Gratis',reward_slug:'free',status:'available',earned_at:`2026-02-${String(id).padStart(2,'0')}`,expires_at:null,ticket_id,...overrides}) as LoyaltyReward;
describe('Loyalty derived from report tickets', () => {
 it('Emigdio: nine visits, two Premium, two Nítido, five Breve', () => {
   const tickets = Array.from({length:9},(_,i)=>ticket(i+1,i<2?'Servicio Premium':i<4?'Lavado Rápido – Nítido':'Lavado Rápido – Breve'));
   const result=loyaltyFromTickets(1,tickets,programs,[]);
   expect(result.totalVisits).toBe(9); expect(result.categories).toEqual({premium:2,nitido:2,breve:5});
   expect(result.progress.map(p=>p.total_washes)).toEqual([2,2]); expect(result.washLog).toHaveLength(4);
 });
 it('removes deleted, cancelled, moved and barbershop tickets, deduplicates program items', () => {
   const t=ticket(1); t.ticket_items.push({...t.ticket_items[0]});
   const result=loyaltyFromTickets(1,[t,ticket(2,'Premium',{status:'cancelled'}),ticket(3,'Premium',{business_line:'barbershop'}),ticket(4,'Premium',{customer_id:2})],programs,[]);
   expect(result.totalVisits).toBe(1);expect(result.progress[0].total_washes).toBe(1);expect(result.lastVisit).toBe(t.created_at);
 });
 it('removes available rewards below threshold or with missing/wrong program origin, preserves redeemed audit', () => {
   const ts=Array.from({length:5},(_,i)=>ticket(i+1));
   expect(loyaltyFromTickets(1,ts,programs,[reward(1,5)]).rewards).toHaveLength(1);
   expect(loyaltyFromTickets(1,ts.slice(0,4),programs,[reward(1,5)]).rewards).toHaveLength(0);
   expect(loyaltyFromTickets(1,ts,programs,[reward(1,null)]).rewards).toHaveLength(0);
   expect(loyaltyFromTickets(1,[],programs,[reward(1,null,{status:'redeemed'})]).rewards).toHaveLength(1);
   ts[4]=ticket(5,'Nítido');expect(loyaltyFromTickets(1,ts,programs,[reward(1,5)]).rewards).toHaveLength(0);
 });
 it('consumed/expired groups reserve their ordinal and cannot be recycled by deleting visits', () => {
   const ts=Array.from({length:5},(_,i)=>ticket(i+1));
   const rs=[reward(1,null,{status:'redeemed',option_group:'first'}),reward(2,null,{status:'expired',option_group:'first'}),reward(3,5,{option_group:'second'})];
   expect(loyaltyFromTickets(1,ts,programs,rs).rewards.filter(r=>r.status==='available')).toHaveLength(0);
 });
 it('cycle wrap uses current tickets, never past redeemed milestones', () => {
   const ts=Array.from({length:10},(_,i)=>ticket(i+1));
   const result=loyaltyFromTickets(1,ts,programs,[reward(1,5,{status:'redeemed'})]);
   expect(result.progress[0]).toMatchObject({total_washes:10,washes_in_cycle:1,cycle_number:1});
 });
});
