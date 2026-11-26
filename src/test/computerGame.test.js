import { describe, it, expect } from 'vitest';
import { BOT_LEVELS } from '../pages/ComputerGamePage';
import { BOT_PERSONAS, getPersona, BOT_TIERS } from '../data/botPersonas';

describe('Phase 3: Computer Game Page & Persona Specifications', () => {
  it('defines the required personas with gender, names, and ELOs', () => {
    // Allen (Male, Level 1)
    const allen = getPersona(1);
    expect(allen.name).toBe('Allen');
    expect(allen.gender).toBe('Male');
    expect(allen.elo).toBe(250);

    // Lavish (Male, Level 2)
    const lavish = getPersona(2);
    expect(lavish.name).toBe('Lavish');
    expect(lavish.gender).toBe('Male');
    expect(lavish.elo).toBe(500);

    // Mufty (Female, Level 3)
    const mufty = getPersona(3);
    expect(mufty.name).toBe('Mufty');
    expect(mufty.gender).toBe('Female');
    expect(mufty.elo).toBe(800);

    // Wanzil (Male, Level 4)
    const wanzil = getPersona(4);
    expect(wanzil.name).toBe('Wanzil');
    expect(wanzil.gender).toBe('Male');
    expect(wanzil.elo).toBe(1100);

    // Morphy, Polgár, Capablanca, Fischer, Kasparov, Carlsen, Stockfish
    expect(getPersona(5).name).toBe('Paul Morphy');
    expect(getPersona(6).name).toBe('Judit Polgár');
    expect(getPersona(7).name).toBe('José Capablanca');
    expect(getPersona(8).name).toBe('Bobby Fischer');
    expect(getPersona(9).name).toBe('Garry Kasparov');
    expect(getPersona(10).name).toBe('Magnus Carlsen');
    expect(getPersona(11).name).toBe('Stockfish Max');
  });

  it('sorts personas by ranking in ascending order of ELO', () => {
    for (let i = 0; i < BOT_PERSONAS.length - 1; i++) {
      expect(BOT_PERSONAS[i].elo).toBeLessThan(BOT_PERSONAS[i + 1].elo);
    }
  });

  it('maps all BOT_LEVELS configurations with valid depths and movetimes', () => {
    expect(BOT_LEVELS.length).toBe(BOT_PERSONAS.length);
    for (const bot of BOT_LEVELS) {
      expect(bot.depth).toBeGreaterThanOrEqual(1);
      expect(bot.movetime).toBeGreaterThanOrEqual(100);
      expect(bot.skillLevel).toBeGreaterThanOrEqual(0);
      expect(bot.skillLevel).toBeLessThanOrEqual(20);
    }
  });

  it('organizes bots into 3 structured tiers', () => {
    expect(BOT_TIERS.length).toBe(3);
    expect(BOT_TIERS[0].tier).toBe('New to Chess');
    expect(BOT_TIERS[1].tier).toBe('Beginner & Club');
    expect(BOT_TIERS[2].tier).toBe('Chess Legends & Masters');
  });
});
