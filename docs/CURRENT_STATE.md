# Current state

- Repository: `setsunafseiei2307/Bodymakers`
- Production: <https://bodymakers.shushushu1990.workers.dev/>
- Production Worker: `bodymakers`
- Deploy method: build static `dist/`, then deploy with the existing `wrangler.jsonc` configuration.

## Main capabilities
- Goal diagnosis and local 12-week Personal Plan
- Program Library with local active-program progression
- Today: food, nutrition targets/recommendations, training, recovery, and daily records
- MEXT food database, recipe data, and optional Open Food Facts product search
- BIG3-first 1RM, RM map, strength standards, work sets, and warmups
- Articles connected to tools

All user data remains in `bodymakers:data:v1` in the browser unless a future product explicitly adds consented sync.
