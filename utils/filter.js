function findPlan(plans, type, budget, weather, location) {
  return plans.filter(p =>
    (!type || p.type === type) &&
    (!budget || p.budget === budget) &&
    (!weather || p.weather === weather) &&
    (!location || p.location === location)
  );
}

function fallbackPlan(plans, type, budget, weather) {
  return plans.filter(p =>
    p.type === type
  );
}

function randomPlan(plans) {
  return plans[Math.floor(Math.random() * plans.length)];
}

// 🔥 scoring
function scorePlans(plans, user) {
  return plans.map(plan => {
    let score = 0;

    if (plan.type === user.type) score += 3;
    if (plan.budget === user.budget) score += 2;
    if (plan.weather === user.weather) score += 2;
    if (plan.location === user.location) score += 3;

    return { ...plan, score };
  });
}

// 🔥 best
function bestPlan(plans) {
  return plans.sort((a, b) => b.score - a.score)[0];
}

module.exports = {
  findPlan,
  fallbackPlan,
  randomPlan,
  scorePlans,
  bestPlan
};
