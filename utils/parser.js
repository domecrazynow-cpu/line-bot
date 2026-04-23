function parseMessage(msg, dictionary) {
  msg = msg.toLowerCase();

  const score = {
    type: {},
    budget: {},
    weather: {},
    location: {}
  };

  for (let row of dictionary) {
    if (msg.includes(row.word)) {

      if (!score[row.category][row.value]) {
        score[row.category][row.value] = 0;
      }

      score[row.category][row.value]++;
    }
  }

  function pickBest(obj) {
    return Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0];
  }

  return {
    type: pickBest(score.type) || "กิน",
    budget: pickBest(score.budget) || "ต่ำ",
    weather: pickBest(score.weather) || "ปกติ",
    location: pickBest(score.location) || "สยาม"
  };
}

module.exports = { parseMessage };

function findNewWords(msg, dictionary) {
  const known = dictionary.map(d => d.word);
  const words = msg.split(" ");

  return words.filter(w => !known.includes(w));
}

module.exports = { parseMessage, findNewWords };
