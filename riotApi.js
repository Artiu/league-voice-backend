import fetch from "node-fetch";

const fetchRiotApi = async (url) => {
	const res = await fetch(url, {
		headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
	});
	if (res.status !== 200) return null;
	const data = await res.json();
	return data;
};

export const getSummoner = (username, tag) => {
	return fetchRiotApi(
		`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${username}/${tag}`
	);
};

export const getCurrentMatchBySummonerId = async (summonerId) => {
	return fetchRiotApi(
		`https://eun1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${summonerId}`
	);
};
