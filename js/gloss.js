/** English gloss and Tulu word for each class in datasettt.
 *  Tulu is written in Kannada script. Weekdays use the Tulu forms (Somara, Budara, …), not Kannada …vara.
 *  Tulu has no fixed "good morning/afternoon" greeting; these follow the common Tulu wording (edde + time of day).
 *  In Tulu, amme is father and appe is mother (the reverse of Kannada). */
export const GLOSS = {
  alright: { en: "Alright", tulu: "ಆಂಡ್" },               // aanD
  baby: { en: "Baby", tulu: "ಬಾಲೆ" },                     // baale
  brother: { en: "Brother", tulu: "ಅಣ್ಣೆ" },               // aNNe (elder brother)
  crowd: { en: "Crowd", tulu: "ಜನ" },                     // jana (people)
  daughter: { en: "Daughter", tulu: "ಮಗಲ್" },              // magal
  father: { en: "Father", tulu: "ಅಮ್ಮೆ" },                 // amme
  friday: { en: "Friday", tulu: "ಸುಕ್ರಾರ" },               // sukraara
  friend: { en: "Friend", tulu: "ದೋಸ್ತಿ" },                // dosti
  good_afternoon: { en: "Good afternoon", tulu: "ಎಡ್ಡೆ ಮದ್ಯಾನ" }, // edde madyaana
  good_morning: { en: "Good morning", tulu: "ಎಡ್ಡೆ ಕಾಂಡೆ" },   // edde kaanDe
  he: { en: "He", tulu: "ಆಯೆ" },                          // aaye
  hello: { en: "Hello", tulu: "ಸೊಲ್ಮೆಲು" },                // solmelu
  help: { en: "Help", tulu: "ಸಹಾಯ" },                     // sahaaya
  hour: { en: "Hour", tulu: "ಗಂಟೆ" },                     // ganTe
  house: { en: "House", tulu: "ಇಲ್ಲ್" },                   // ill
  how_are_you: { en: "How are you?", tulu: "ಎಂಚ ಉಲ್ಲರ್?" }, // encha ullar?
  i: { en: "I", tulu: "ಯಾನ್" },                           // yaan
  it: { en: "It", tulu: "ಅವು" },                          // avu
  love: { en: "Love", tulu: "ಮೋಕೆ" },                     // moke
  man: { en: "Man", tulu: "ಆಣ್" },                        // aaN
  minute: { en: "Minute", tulu: "ನಿಮಿಷ" },                 // nimisha
  monday: { en: "Monday", tulu: "ಸೋಮಾರ" },                 // somaara
  month: { en: "Month", tulu: "ತಿಂಗೊಲು" },                 // tingolu
  mother: { en: "Mother", tulu: "ಅಪ್ಪೆ" },                 // appe
  neighbour: { en: "Neighbour", tulu: "ನೆರೆಕರೆ" },          // nerekare
  player: { en: "Player", tulu: "ಆಟಗಾರೆ" },                // aaTagaare
  saturday: { en: "Saturday", tulu: "ಸನಿಯಾರ" },            // saniyaara
  she: { en: "She", tulu: "ಆಲ್" },                        // aal
  sister: { en: "Sister", tulu: "ಅಕ್ಕ" },                  // akka (elder sister)
  son: { en: "Son", tulu: "ಮಗೆ" },                        // mage
  sunday: { en: "Sunday", tulu: "ಐತಾರ" },                  // aitaara
  thank_you: { en: "Thank you", tulu: "ಉಪಕಾರ" },           // upakaara
  thursday: { en: "Thursday", tulu: "ಗುರ್ವಾರ" },           // gurvaara
  today: { en: "Today", tulu: "ಇನಿ" },                     // ini
  tomorrow: { en: "Tomorrow", tulu: "ಎಲ್ಲೆ" },              // elle
  tuesday: { en: "Tuesday", tulu: "ಅಂಗಾರೆ" },              // angaare
  wednesday: { en: "Wednesday", tulu: "ಬುದಾರ" },           // budaara
  week: { en: "Week", tulu: "ವಾರ" },                       // vaara
  woman: { en: "Woman", tulu: "ಪೊಣ್ಣು" },                  // poNNu
  year: { en: "Year", tulu: "ವರ್ಸ" },                      // varsa
  yesterday: { en: "Yesterday", tulu: "ಕೋಡೆ" },            // kode
  you: { en: "You", tulu: "ಈರ್" }                          // eer (respectful)
};

export function glossOf(id) {
  return GLOSS[id] || { en: id, tulu: id };
}
