import fetch from "node-fetch";

const fetchRiotApi = async (path) => {
    const res = await fetch("https://eun1.api.riotgames.com" + path, {
        headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
    });
    if (res.status !== 200) return null;
    const data = await res.json();
    return data;
};

export const getSummonerByName = (summonerName) => {
    return fetchRiotApi(`/lol/summoner/v4/summoners/by-name/${summonerName}`);
};

export const getCurrentMatchBySummonerId = async (summonerId) => {
    return fetchRiotApi(`/lol/spectator/v4/active-games/by-summoner/${summonerId}`);
};
