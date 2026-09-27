// Flash sale: every prepared buyer (logged in, 1 unit in the cart) checks out at the same moment.
// Expected: exactly `stock` orders, every other request 409 INSUFFICIENT_STOCK, nothing else.
//
//   docker run --rm --network <compose-project>_default -v "$PWD/loadtest:/scripts" grafana/k6:2.3.0 \
//     run -e BASE_URL=http://backend:8000 /scripts/flash_sale.js

import http from 'k6/http'
import { check } from 'k6'
import { SharedArray } from 'k6/data'
import { Counter } from 'k6/metrics'

// Loaded once and shared by all virtual users (instead of one copy per user).
const prepared = new SharedArray('prepared', () => [JSON.parse(open('./.data/flash_sale.json'))])[0]
const BASE_URL = __ENV.BASE_URL || 'http://backend:8000'

const ordersCreated = new Counter('orders_created')
const soldOut = new Counter('sold_out_409')
const unexpected = new Counter('unexpected_responses')

// 409 is a correct answer in a flash sale, so don't count it as a failed request.
http.setResponseCallback(http.expectedStatuses(201, 409))

export const options = {
  scenarios: {
    // One virtual user per buyer, one checkout each, all starting together: a burst, not a ramp.
    flash_sale: { executor: 'per-vu-iterations', vus: prepared.tokens.length, iterations: 1, maxDuration: '2m' },
  },
  thresholds: {
    unexpected_responses: ['count==0'],
    orders_created: [`count==${prepared.stock}`],
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export default function () {
  const response = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({ shipping_address: '1 Load Test Lane, Bengaluru' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${prepared.tokens[__VU - 1]}`,
        'Idempotency-Key': `flash-${__VU}-${Date.now()}`,
      },
      tags: { name: 'checkout' },
    },
  )
  const soldOutResponse = response.status === 409 && response.json('error.code') === 'INSUFFICIENT_STOCK'
  if (response.status === 201) ordersCreated.add(1)
  else if (soldOutResponse) soldOut.add(1)
  else unexpected.add(1)
  check(response, { 'order placed, or sold out (409)': () => response.status === 201 || soldOutResponse })
}

export function handleSummary(data) {
  const count = (name) => (data.metrics[name] ? data.metrics[name].values.count : 0)
  const duration = data.metrics.http_req_duration.values
  const lines = [
    `buyers: ${prepared.tokens.length}, stock: ${prepared.stock}`,
    `requests: ${count('http_reqs')}  orders: ${count('orders_created')}  sold out (409): ${count('sold_out_409')}  unexpected: ${count('unexpected_responses')}`,
    `latency ms  med ${duration.med.toFixed(1)}  p90 ${duration['p(90)'].toFixed(1)}  p95 ${duration['p(95)'].toFixed(1)}  p99 ${duration['p(99)'].toFixed(1)}  max ${duration.max.toFixed(1)}`,
    `whole burst: ${(data.state.testRunDurationMs / 1000).toFixed(2)} s, ${data.metrics.http_reqs.values.rate.toFixed(1)} req/s`,
  ]
  return { stdout: lines.join('\n') + '\n', '/scripts/.data/summary.json': JSON.stringify(data, null, 1) }
}
