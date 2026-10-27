import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoyaltyProgramCard from './LoyaltyProgramCard';
import type { LoyaltyProgram, LoyaltyProgress, LoyaltyReward } from '@/hooks/useLoyaltyV3';

describe('current cycle display', () => {
  it('a redeemed reward from the first cycle does not inflate the second cycle', () => {
    const program: LoyaltyProgram = {id:1,name:'Premium',slug:'premium',active:true,cycle_size:9,rewards:[{at:5,reward:'Gratis',reward_slug:'free'}]};
    const progress: LoyaltyProgress = {id:1,customer_id:1,program_id:1,total_washes:10,washes_in_cycle:1,cycle_number:1,updated_at:''};
    const reward: LoyaltyReward = {id:1,customer_id:1,program_id:1,ticket_id:5,reward_name:'Gratis',reward_slug:'free',status:'redeemed',earned_at:'2026-01-01',expires_at:null,option_group:'premium_5w_c0'};
    render(<LoyaltyProgramCard program={program} progress={progress} rewards={[reward]} />);
    expect(screen.getByText('1 / 9')).toBeInTheDocument();
    expect(screen.getByText('4 restantes')).toBeInTheDocument();
    expect(screen.queryByText('Canjeado')).not.toBeInTheDocument();
  });
});
