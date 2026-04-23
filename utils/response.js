function formatResponse(plan) {
  return `📍 ${plan.location}
✨ ${plan.plan}

💡 หมวด: ${plan.type} | งบ: ${plan.budget}`;
}

module.exports = { formatResponse };
