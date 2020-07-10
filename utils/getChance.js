const getChance = (probability) => {
    return !!probability && Math.random() <= probability;
}

module.exports = getChance;