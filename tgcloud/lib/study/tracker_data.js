// Biology tracker data (from study.py BIOLOGY_TRACKER). Names are separate from stable IDs.
const ch = (id, name) => ({ id, name });

export const BIOLOGY_TRACKER = {
  '11': {
    label: 'Class 11', icon: '📗',
    units: [
      { id: '11_u1', title: 'UNIT I — DIVERSITY IN THE LIVING WORLD', short: 'Unit I · Diversity', chapters: [
        ch('11_1', 'The Living World'), ch('11_2', 'Biological Classification'),
        ch('11_3', 'Plant Kingdom'), ch('11_4', 'Animal Kingdom')] },
      { id: '11_u2', title: 'UNIT II — STRUCTURAL ORGANISATION IN PLANTS AND ANIMALS', short: 'Unit II · Structural Organisation', chapters: [
        ch('11_5', 'Morphology of Flowering Plants'), ch('11_6', 'Anatomy of Flowering Plants'),
        ch('11_7', 'Structural Organisation in Animals')] },
      { id: '11_u3', title: 'UNIT III — CELL: STRUCTURE AND FUNCTIONS', short: 'Unit III · Cell', chapters: [
        ch('11_8', 'Cell: The Unit of Life'), ch('11_9', 'Biomolecules'),
        ch('11_10', 'Cell Cycle and Cell Division')] },
      { id: '11_u4', title: 'UNIT IV — PLANT PHYSIOLOGY', short: 'Unit IV · Plant Physiology', chapters: [
        ch('11_11', 'Photosynthesis in Plants'), ch('11_12', 'Respiration in Plants'),
        ch('11_13', 'Plant Growth and Development')] },
      { id: '11_u5', title: 'UNIT V — HUMAN PHYSIOLOGY', short: 'Unit V · Human Physiology', chapters: [
        ch('11_14', 'Breathing and Exchange of Gases'), ch('11_15', 'Body Fluids and Circulation'),
        ch('11_16', 'Excretory Products and their Elimination'), ch('11_17', 'Locomotion and Movement'),
        ch('11_18', 'Neural Control and Coordination'), ch('11_19', 'Chemical Coordination and Integration')] },
    ],
  },
  '12': {
    label: 'Class 12', icon: '📘',
    units: [
      { id: '12_u6', title: 'UNIT VI — REPRODUCTION', short: 'Unit VI · Reproduction', chapters: [
        ch('12_1', 'Sexual Reproduction in Flowering Plants'), ch('12_2', 'Human Reproduction'),
        ch('12_3', 'Reproductive Health')] },
      { id: '12_u7', title: 'UNIT VII — GENETICS AND EVOLUTION', short: 'Unit VII · Genetics & Evolution', chapters: [
        ch('12_4', 'Principles of Inheritance and Variation'), ch('12_5', 'Molecular Basis of Inheritance'),
        ch('12_6', 'Evolution')] },
      { id: '12_u8', title: 'UNIT VIII — BIOLOGY IN HUMAN WELFARE', short: 'Unit VIII · Human Welfare', chapters: [
        ch('12_7', 'Human Health and Disease'), ch('12_8', 'Microbes in Human Welfare')] },
      { id: '12_u9', title: 'UNIT IX — BIOTECHNOLOGY', short: 'Unit IX · Biotechnology', chapters: [
        ch('12_9', 'Biotechnology: Principles and Processes'), ch('12_10', 'Biotechnology and its Applications')] },
      { id: '12_u10', title: 'UNIT X — ECOLOGY', short: 'Unit X · Ecology', chapters: [
        ch('12_11', 'Organisms and Populations'), ch('12_12', 'Ecosystem'),
        ch('12_13', 'Biodiversity and Conservation')] },
    ],
  },
};

export const ALL_UNITS = Object.values(BIOLOGY_TRACKER).flatMap((c) => c.units);
export const ALL_CHAPTERS = ALL_UNITS.flatMap((u) => u.chapters.map((c) => ({ ...c, unitId: u.id })));
export const getUnit = (unitId) => ALL_UNITS.find((u) => u.id === unitId) || null;
export const getChapter = (chId) => ALL_CHAPTERS.find((c) => c.id === chId) || null;
