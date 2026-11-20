/**
 * VoteAccess voter-education content (bundled => available offline).
 *
 * SOURCE: written from general, long-standing INEC voter-education guidance and the
 * Electoral Act 2026 (which replaced the 2022 Act). Check it against INEC's current publications
 * before each election; `reviewStatus` (a source note) is shown to users.
 * Election-specific facts (dates, candidates) are NOT written here: they come from
 * /data/elections/2027 (generated from INEC's own publications) and are shown separately.
 */
export const CONTENT_META = {
  version: "0.1.0",
  updatedAt: "2026-11-18",
  // The 2027 dates and the list of governorship states in the topics below were checked
  // against INEC's calendar and final lists on 2026-11-18.
  reviewStatus: "Based on INEC voter-education guidance. Procedures can change: check inecnigeria.org for the latest.",
  source: { name: "INEC voter education guidance; Electoral Act 2026", url: "https://inecnigeria.org" },
};

export const TOPICS = [
  {
    id: "elections-2027",
    title: "What you vote for in 2027",
    simple: "Saturday 16 January 2027: President, Senator and House of Representatives member. Saturday 6 February 2027: Governor (in 28 states) and State House of Assembly member.",
    full: "There are two election days. On Saturday 16 January 2027 you receive three ballot papers: President, Senate (your senatorial district) and House of Representatives (your federal constituency). On Saturday 6 February 2027 you receive two: Governor and State House of Assembly (your state constituency). Governorship elections hold in 28 states; Anambra, Bayelsa, Edo, Ekiti, Imo, Kogi, Ondo and Osun elect their governors on separate (off-cycle) dates. The FCT has no governor or State House of Assembly. You vote at the polling unit where you registered, on both days.",
  },
  {
    id: "who-can-vote",
    title: "Who can vote",
    simple: "You can vote if you are a Nigerian citizen, 18 years or older, and registered as a voter.",
    full: "To vote you must be a Nigerian citizen aged 18 or above, be registered on the voters' register, and vote at the polling unit where you are registered. You need your Permanent Voter Card (PVC).",
  },
  {
    id: "what-to-bring",
    title: "What to bring on election day",
    simple: "Bring your Permanent Voter Card (PVC). Go to your own polling unit.",
    full: "Bring your Permanent Voter Card (PVC). You can only vote at the polling unit where you registered. Arrive early and join the queue. Do not wear clothing or items with party colours or symbols.",
  },
  {
    id: "accreditation",
    title: "Accreditation (BVAS)",
    simple: "An official checks your PVC and your fingerprint or face with a machine called BVAS. Then you can vote.",
    full: "Accreditation confirms you are the registered voter. INEC officials use the Bimodal Voter Accreditation System (BVAS) to read your PVC and verify you by fingerprint or facial recognition. Accreditation and voting take place together at the polling unit.",
  },
  {
    id: "how-to-vote",
    title: "How to vote, step by step",
    simple: "Get your ballot paper. Go behind the screen. Press your thumb in the box of the party you choose. Fold it. Put it in the ballot box.",
    full: "1. After accreditation, the presiding officer gives you a stamped and signed ballot paper. 2. Go to the voting cubicle. 3. Ink your thumb and press it inside the box of the party of your choice, without touching other boxes. 4. Fold the ballot paper so your mark is hidden. 5. Drop it in the ballot box in full view of everyone.",
  },
  {
    id: "secrecy",
    title: "Your vote is secret",
    simple: "Nobody should see who you voted for. Do not show or photograph your marked ballot.",
    full: "Ballot secrecy protects you. Never show your marked ballot to anyone and never photograph it. AwaVote will never ask you to photograph a ballot paper — only publicly displayed result sheets after counting.",
  },
  {
    id: "assistance",
    title: "Help for persons with disabilities",
    simple: "If you have a disability, you can ask for help. You can bring someone you trust to help you vote.",
    full: "Persons with disabilities, the elderly, pregnant women and nursing mothers may be given priority in the queue. A voter who needs help may be assisted by a person of their choice. INEC provides aids such as braille ballot guides and magnifying glasses at polling units where available.",
  },
  {
    id: "vote-buying",
    title: "Vote buying is an offence",
    simple: "Do not sell your vote. Do not take money or gifts to vote for anyone. It is against the law.",
    full: "Offering, giving or accepting money or gifts to influence a vote is an offence under the Electoral Act. If you see it, you can report it in AwaVote. Reports are treated as allegations until reviewed.",
  },
  {
    id: "collation",
    title: "How results are added up",
    simple: "Results start at your polling unit. They are added up at the ward, then the local government, then the state or constituency, and announced at each step.",
    full: "Counting happens openly at every polling unit and the figures are written on Form EC8A, which is signed, posted publicly and sent to INEC's Result Viewing Portal (IReV). Collation officers then add up the results level by level on the EC8 series of forms: ward, then local government area, then the level of the contest — the senatorial district, federal or state constituency, the state (for governor), or the nation (for president). A returning officer declares the winner at the final level.",
  },
  {
    id: "results",
    title: "How results are recorded",
    simple: "After counting, the officials write the results on a form called EC8A and show it to everyone at the polling unit.",
    full: "After voting closes, ballots are sorted and counted openly at the polling unit. The presiding officer records the figures on Form EC8A, announces them, and a copy of the results is posted at the polling unit. A photo of the EC8A is uploaded to INEC's Result Viewing Portal (IReV).",
  },
];

export const GLOSSARY = [
  ["PVC", "Permanent Voter Card — the card you need to vote."],
  ["BVAS", "Bimodal Voter Accreditation System — the device used to verify voters."],
  ["Polling unit", "The place where you are registered to vote."],
  ["Presiding officer", "The INEC official in charge of a polling unit."],
  ["Accreditation", "Checking that you are the registered voter before you vote."],
  ["EC8A", "The form on which polling-unit results are recorded."],
  ["IReV", "INEC Result Viewing Portal, where photos of result sheets are published."],
  ["Collation", "Adding up results from many polling units at ward, LGA, state and national level."],
];
