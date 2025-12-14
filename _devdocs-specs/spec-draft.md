# Web LLM Sandbox
## Summary

Let's build a React based web llm sandbox. 
Where we can load and prompt local llms with a simple, yet, extensible chat interface.
We want the prompt context to be extensible, so, injecting json, or text into the context in order to experiment with different context structures. 
Ideally we want the ability to create complex and data driven prompt structures to experiment with the outcome of local browser based llms.

## Tech

browser app
webpack webpack-dev-server typescript
React antd ant-design/icons

## Details

I think in this case let's build the basics. 
We need a chat console to start that has a way to see history and simple text prompts to start. 
I suppose ideally we want to be able to have an LLM conversation between two llms. 
We want to be able to send differnet data driven json and text prompts 
I want to be able to load and run differnet local llms
The ability to track logs to attach graphs on interactions with the llm would be great. 
I placed a log service in tools that I've used before, might be nice to have concurrently so we can run both of those at the same time. 
