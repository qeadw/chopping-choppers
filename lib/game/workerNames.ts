// 700 unique worker names for choppers and collectors
export const WORKER_NAMES: string[] = [
  // Common names (A-Z)
  'Alex', 'Ben', 'Charlie', 'Dan', 'Eli', 'Finn', 'Gus', 'Henry', 'Ivan', 'Jack',
  'Kyle', 'Leo', 'Max', 'Nate', 'Owen', 'Pete', 'Quinn', 'Ryan', 'Sam', 'Tom',
  'Victor', 'Will', 'Xavier', 'Yuri', 'Zack', 'Adam', 'Blake', 'Cole', 'Drew', 'Evan',
  'Felix', 'Grant', 'Hugo', 'Isaac', 'Jake', 'Keith', 'Lance', 'Miles', 'Noah', 'Oscar',
  'Paul', 'Reed', 'Seth', 'Troy', 'Vince', 'Wade', 'Wyatt', 'Zane', 'Aaron', 'Bryce',
  // Fantasy names
  'Aldric', 'Brom', 'Cedric', 'Doran', 'Elric', 'Fenris', 'Garin', 'Haldor', 'Ingvar', 'Jorn',
  'Kael', 'Loric', 'Magnus', 'Nils', 'Oren', 'Pax', 'Quill', 'Rolf', 'Sven', 'Tor',
  'Ulric', 'Viggo', 'Wulfric', 'Xander', 'Yorick', 'Zephyr', 'Alaric', 'Bjorn', 'Cyrus', 'Drake',
  'Erik', 'Flint', 'Grimm', 'Harald', 'Igor', 'Jasper', 'Knox', 'Leif', 'Mercer', 'Nero',
  'Odin', 'Pike', 'Ragnar', 'Silas', 'Thane', 'Ulf', 'Vex', 'Wolf', 'Xeric', 'Yosef',
  // Nature-inspired
  'Ash', 'Birch', 'Cedar', 'Dale', 'Elm', 'Fern', 'Glen', 'Heath', 'Ivy', 'Jay',
  'Kestrel', 'Lark', 'Moss', 'North', 'Oak', 'Pine', 'Reed', 'Stone', 'Thorn', 'Vale',
  'Willow', 'Brook', 'Cliff', 'Dusk', 'Echo', 'Frost', 'Grove', 'Hawk', 'Lake', 'Marsh',
  'River', 'Shade', 'Storm', 'Terra', 'Wren', 'Briar', 'Clay', 'Dove', 'Ember', 'Flare',
  'Gale', 'Haze', 'Jet', 'Leaf', 'Meadow', 'Rain', 'Sky', 'Snow', 'Summit', 'Thicket',
  // Medieval occupations
  'Smith', 'Cooper', 'Fletcher', 'Miller', 'Turner', 'Mason', 'Porter', 'Baker', 'Carter', 'Sawyer',
  'Hunter', 'Fisher', 'Tanner', 'Weaver', 'Carver', 'Thatcher', 'Walker', 'Potter', 'Archer', 'Rider',
  'Guard', 'Scout', 'Ranger', 'Tracker', 'Forager', 'Digger', 'Hauler', 'Loader', 'Lifter', 'Runner',
  // Strong/worker names
  'Axel', 'Brick', 'Chuck', 'Duke', 'Earl', 'Frank', 'Hank', 'Jeb', 'Kurt', 'Lars',
  'Mack', 'Nick', 'Otis', 'Ralph', 'Stan', 'Tex', 'Vern', 'Walt', 'Zeke', 'Buck',
  'Colt', 'Dirk', 'Gage', 'Hal', 'Jace', 'Kane', 'Luke', 'Mark', 'Nash', 'Pace',
  'Rex', 'Russ', 'Tank', 'Trent', 'Vance', 'Webb', 'Zed', 'Ace', 'Beau', 'Cash',
  'Dex', 'Fox', 'Gray', 'Hart', 'Jett', 'King', 'Link', 'Mars', 'Neil', 'Rock',
  // International names
  'Akira', 'Boris', 'Carlos', 'Diego', 'Emilio', 'Franco', 'Gino', 'Hans', 'Ichiro', 'Jorge',
  'Klaus', 'Luigi', 'Marco', 'Nico', 'Omar', 'Pablo', 'Ramon', 'Sergio', 'Tomas', 'Uri',
  'Viktor', 'Werner', 'Yuki', 'Zoran', 'Andre', 'Bruno', 'Costa', 'Dante', 'Enrique', 'Felipe',
  'Gustav', 'Henrik', 'Ivo', 'Javier', 'Kaito', 'Lorenzo', 'Miguel', 'Niko', 'Otto', 'Pedro',
  'Rico', 'Stefan', 'Takeshi', 'Umberto', 'Vlad', 'Wolfgang', 'Yoshi', 'Zoltan', 'Anton', 'Basil',
  // More common names
  'Arthur', 'Bernard', 'Clarence', 'Douglas', 'Edward', 'Frederick', 'George', 'Harold', 'Irving', 'Jerome',
  'Kenneth', 'Leonard', 'Maurice', 'Norman', 'Oliver', 'Patrick', 'Raymond', 'Stanley', 'Theodore', 'Vincent',
  'Wallace', 'Albert', 'Benjamin', 'Calvin', 'Daniel', 'Ernest', 'Franklin', 'Gerald', 'Howard', 'James',
  'Kevin', 'Lawrence', 'Martin', 'Nathan', 'Peter', 'Robert', 'Stephen', 'Thomas', 'Warren', 'William',
  // Mythological names
  'Ajax', 'Atlas', 'Castor', 'Damon', 'Eros', 'Helios', 'Jason', 'Kronos', 'Linus', 'Midas',
  'Nestor', 'Orion', 'Perseus', 'Remus', 'Spartacus', 'Titan', 'Zeus', 'Apollo', 'Ares', 'Hector',
  'Icarus', 'Leonidas', 'Odysseus', 'Phoenix', 'Triton', 'Vulcan', 'Achilles', 'Brutus', 'Caesar', 'Draco',
  // Short punchy names
  'Bo', 'Cal', 'Dan', 'Ed', 'Gil', 'Hal', 'Ian', 'Jon', 'Ken', 'Lee',
  'Mel', 'Ned', 'Pat', 'Ray', 'Ron', 'Roy', 'Sal', 'Ted', 'Tim', 'Van',
  'Wes', 'Abe', 'Art', 'Bud', 'Chet', 'Don', 'Gus', 'Ike', 'Jim', 'Joe',
  'Lou', 'Moe', 'Nat', 'Red', 'Sid', 'Stu', 'Vic', 'Zip', 'Ax', 'Bix',
  // Compound/unique names
  'Blackwood', 'Ironside', 'Stoneheart', 'Oakenshield', 'Steelarm', 'Hardwick', 'Thornwood', 'Redbeard', 'Greymane', 'Whitewood',
  'Longstrider', 'Swiftaxe', 'Strongbow', 'Talloak', 'Deeproot', 'Highcliff', 'Broadback', 'Quickfoot', 'Sharpedge', 'Trueblade',
  // More fantasy
  'Aric', 'Bran', 'Conn', 'Dar', 'Egan', 'Flyn', 'Garth', 'Heath', 'Ivar', 'Jorah',
  'Kern', 'Loken', 'Morn', 'Niall', 'Oric', 'Penn', 'Rhen', 'Slade', 'Tarn', 'Uther',
  'Vorn', 'Wynn', 'Xylo', 'Yoren', 'Zorn', 'Ansel', 'Beric', 'Corwin', 'Davos', 'Edric',
  'Falk', 'Gendry', 'Harwin', 'Jareth', 'Kellan', 'Lorcan', 'Maddox', 'Navin', 'Oswin', 'Podrick',
  'Rodrik', 'Sandor', 'Tobas', 'Umber', 'Vayon', 'Waymar', 'Yoren', 'Zorric', 'Aegon', 'Benjen',
  // Animal-inspired
  'Bear', 'Bull', 'Crow', 'Eagle', 'Fox', 'Hawk', 'Lion', 'Raven', 'Wolf', 'Boar',
  'Stag', 'Ram', 'Badger', 'Falcon', 'Lynx', 'Otter', 'Pike', 'Salmon', 'Tiger', 'Viper',
  // Color names
  'Rusty', 'Dusty', 'Sandy', 'Rocky', 'Smokey', 'Copper', 'Silver', 'Goldie', 'Bronze', 'Slate',
  'Onyx', 'Jasper', 'Flint', 'Cobalt', 'Crimson', 'Scarlet', 'Auburn', 'Russet', 'Tan', 'Ash',
  // More occupational
  'Axeman', 'Bowman', 'Cutler', 'Drover', 'Farrier', 'Grinder', 'Hammerer', 'Joiner', 'Kiln', 'Logger',
  'Miner', 'Nailer', 'Packer', 'Quarrier', 'Rigger', 'Smelter', 'Tapper', 'Woodman', 'Cutter', 'Splitter',
  // Viking/Norse
  'Astrid', 'Brandr', 'Canute', 'Dagr', 'Eirik', 'Freyr', 'Gunnar', 'Halfdan', 'Ivar', 'Jarl',
  'Knut', 'Lief', 'Magnus', 'Njord', 'Olaf', 'Ragnar', 'Sigurd', 'Thorin', 'Ulfric', 'Vidar',
  // Celtic
  'Angus', 'Brennan', 'Callum', 'Declan', 'Eamon', 'Fergus', 'Gavin', 'Hamish', 'Keegan', 'Liam',
  'Murphy', 'Nolan', 'Padraig', 'Quinn', 'Rory', 'Seamus', 'Tiernan', 'Vaughn', 'Brogan', 'Cian',
  // Germanic
  'Adelbert', 'Bertram', 'Conrad', 'Dietrich', 'Emmerich', 'Friedrich', 'Gottfried', 'Heinrich', 'Kaspar', 'Ludwig',
  'Manfred', 'Norbert', 'Reinhold', 'Siegfried', 'Walther', 'Wilhelm', 'Albrecht', 'Burkhard', 'Gerhard', 'Hartmut',
  // Slavic
  'Aleksei', 'Bogdan', 'Dmitri', 'Evgeni', 'Fyodor', 'Grigori', 'Ivan', 'Kirill', 'Lev', 'Mikhail',
  'Nikolai', 'Pavel', 'Ruslan', 'Sergei', 'Vadim', 'Yakov', 'Andrei', 'Vasili', 'Yegor', 'Zakhar',
  // Additional unique names
  'Able', 'Bodhi', 'Crew', 'Dax', 'Ezra', 'Ford', 'Gage', 'Hayes', 'Jude', 'Knox',
  'Lane', 'Maverick', 'Noel', 'Otto', 'Porter', 'Quest', 'Reid', 'Sage', 'Tucker', 'Urban',
  'Valor', 'Walker', 'York', 'Zion', 'Arrow', 'Banner', 'Chance', 'Dash', 'Edge', 'Fleet',
  'Griff', 'Harbor', 'Jagger', 'Kodiak', 'Legend', 'Major', 'Noble', 'Onyx', 'Pride', 'Quest',
  'Ridge', 'Stryker', 'Trace', 'Unit', 'Vigor', 'Wilder', 'Zenith', 'Blaze', 'Crag', 'Drift',
  'Forge', 'Granite', 'Helm', 'Iron', 'Kite', 'Lock', 'Mast', 'Nail', 'Ore', 'Plank',
  'Quartz', 'Rivet', 'Spar', 'Timber', 'Wedge', 'Yoke', 'Auger', 'Bolt', 'Chisel', 'Drill',
  'File', 'Gauge', 'Hew', 'Jack', 'Kerf', 'Level', 'Mallet', 'Punch', 'Rasp', 'Saw',
  'Vise', 'Wrench', 'Adze', 'Brace', 'Clamp', 'Dowel', 'Gimlet', 'Plane', 'Scribe', 'Spoke',
];

// Get a random unique name for a worker
export function getWorkerName(workerIndex: number): string {
  return WORKER_NAMES[workerIndex % WORKER_NAMES.length];
}
