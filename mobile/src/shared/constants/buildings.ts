export interface Building {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  campus: 'Busch' | 'College Ave' | 'Livingston' | 'Cook/Douglass';
}

export const RUTGERS_BUILDINGS: Building[] = [
  // Busch Campus
  { name: 'Busch Student Center', latitude: 40.5231, longitude: -74.4588, address: '604 Bartholomew Rd', campus: 'Busch' },
  { name: 'Hill Center', latitude: 40.5217, longitude: -74.4623, address: '110 Frelinghuysen Rd', campus: 'Busch' },
  { name: 'ARC (Allison Road Classroom)', latitude: 40.5210, longitude: -74.4610, address: '618 Allison Rd', campus: 'Busch' },
  { name: 'Library of Science and Medicine', latitude: 40.5215, longitude: -74.4604, address: '165 Bevier Rd', campus: 'Busch' },
  { name: 'Werblin Recreation Center', latitude: 40.5196, longitude: -74.4552, address: '656 Bartholomew Rd', campus: 'Busch' },
  { name: 'SHI Stadium', latitude: 40.5138, longitude: -74.4646, address: '1 Scarlet Knight Way', campus: 'Busch' },
  { name: 'Richard Weeks Hall of Engineering', latitude: 40.5234, longitude: -74.4608, address: '500 Bartholomew Rd', campus: 'Busch' },
  { name: 'Pharmacy Building', latitude: 40.5242, longitude: -74.4660, address: '160 Frelinghuysen Rd', campus: 'Busch' },
  { name: 'Physics & Astronomy Building', latitude: 40.5199, longitude: -74.4680, address: '136 Frelinghuysen Rd', campus: 'Busch' },

  // College Ave Campus
  { name: 'College Ave Student Center', latitude: 40.5026, longitude: -74.4491, address: '126 College Ave', campus: 'College Ave' },
  { name: 'The Yard', latitude: 40.4996, longitude: -74.4481, address: '40 College Ave', campus: 'College Ave' },
  { name: 'Alexander Library', latitude: 40.5015, longitude: -74.4485, address: '169 College Ave', campus: 'College Ave' },
  { name: 'College Ave Gym', latitude: 40.5012, longitude: -74.4492, address: '130 College Ave', campus: 'College Ave' },
  { name: 'Academic Building (AB)', latitude: 40.4988, longitude: -74.4480, address: '15 Seminary Pl', campus: 'College Ave' },
  { name: 'Scott Hall', latitude: 40.4994, longitude: -74.4475, address: '43 College Ave', campus: 'College Ave' },
  { name: 'Honors College', latitude: 40.5002, longitude: -74.4488, address: '5 Seminary Pl', campus: 'College Ave' },
  { name: 'Zimmerli Art Museum', latitude: 40.4998, longitude: -74.4465, address: '71 Hamilton St', campus: 'College Ave' },

  // Livingston Campus
  { name: 'Livingston Student Center', latitude: 40.5238, longitude: -74.4368, address: '84 Joyce Kilmer Ave', campus: 'Livingston' },
  { name: 'Jersey Mike\'s Arena (RAC)', latitude: 40.5262, longitude: -74.4390, address: '83 Rockafeller Rd', campus: 'Livingston' },
  { name: 'Carr Library', latitude: 40.5244, longitude: -74.4347, address: 'Livingston Campus', campus: 'Livingston' },
  { name: 'Rutgers Business School', latitude: 40.5222, longitude: -74.4365, address: '100 Rockafeller Rd', campus: 'Livingston' },
  { name: 'Beck Hall', latitude: 40.5230, longitude: -74.4350, address: 'Livingston Campus', campus: 'Livingston' },
  { name: 'Lucy Stone Hall', latitude: 40.5235, longitude: -74.4355, address: 'Livingston Campus', campus: 'Livingston' },
  { name: 'Livingston Apts', latitude: 40.5210, longitude: -74.4340, address: 'Livingston Campus', campus: 'Livingston' },

  // Cook/Douglass Campus
  { name: 'Cook Student Center', latitude: 40.4851, longitude: -74.4373, address: '59 Biel Rd', campus: 'Cook/Douglass' },
  { name: 'Douglass Student Center', latitude: 40.4828, longitude: -74.4358, address: '100 George St', campus: 'Cook/Douglass' },
  { name: 'Mabel Smith Douglass Library', latitude: 40.4835, longitude: -74.4360, address: '8 Chapel Dr', campus: 'Cook/Douglass' },
  { name: 'Loreee Gymnasium', latitude: 40.4860, longitude: -74.4380, address: '70 Lipman Dr', campus: 'Cook/Douglass' },
  { name: 'Passion Puddle', latitude: 40.4830, longitude: -74.4370, address: 'Cook Campus', campus: 'Cook/Douglass' },
  { name: 'Hickman Hall', latitude: 40.4840, longitude: -74.4365, address: '89 George St', campus: 'Cook/Douglass' },
  { name: 'Food Science Building', latitude: 40.4810, longitude: -74.4390, address: '65 Dudley Rd', campus: 'Cook/Douglass' },
];
