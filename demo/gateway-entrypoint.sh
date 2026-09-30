#!/bin/sh
set -eu

web_ip="$(getent hosts web | awk 'NR == 1 { print $1 }')"
api_ip="$(getent hosts api | awk 'NR == 1 { print $1 }')"

if [ -z "$web_ip" ] || [ -z "$api_ip" ]; then
  echo "Safe gateway could not resolve its internal upstreams." >&2
  exit 1
fi

iptables -w -F OUTPUT
iptables -w -A OUTPUT -o lo -j ACCEPT
iptables -w -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -A OUTPUT -d 127.0.0.11 -p udp --dport 53 -j ACCEPT
iptables -w -A OUTPUT -d 127.0.0.11 -p tcp --dport 53 -j ACCEPT
iptables -w -A OUTPUT -d "$web_ip" -p tcp --dport 3000 -j ACCEPT
iptables -w -A OUTPUT -d "$api_ip" -p tcp --dport 3001 -j ACCEPT
iptables -w -P OUTPUT DROP

ip6tables -w -F OUTPUT
ip6tables -w -A OUTPUT -o lo -j ACCEPT
ip6tables -w -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -w -P OUTPUT DROP

exec su-exec 101:101 "$@"
