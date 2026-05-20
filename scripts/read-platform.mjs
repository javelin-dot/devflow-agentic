#!/usr/bin/env node
import { getProfile } from './node-profile.mjs';
console.log(getProfile().platform);
