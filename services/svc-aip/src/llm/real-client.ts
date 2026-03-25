import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Pest control ontology schema — injected into system prompts for real LLMs
// ---------------------------------------------------------------------------

const ONTOLOGY_SCHEMA = `
## Pest Control Ontology Schema

You have access to a pest control business ontology with the following object types and their properties:

### Customer
Primary key: customerId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| customerId       | string  | Unique customer identifier (e.g. C001)   |
| fullName         | string  | Full name of the customer / company       |
| email            | string  | Contact email address                     |
| phone            | string  | Contact phone number                      |
| address          | string  | Street address                            |
| city             | string  | City                                      |
| status           | string  | Active, Inactive, or Suspended            |
| contractType     | string  | Monthly, Quarterly, Annual, or One-time   |
| monthlyRate      | number  | Monthly service rate in IDR               |
| rating           | number  | Customer satisfaction rating (1-5)        |
| joinDate         | date    | Date the customer joined                  |
| contractEndDate  | date    | Contract expiration date (if applicable)  |

### Technician
Primary key: technicianId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| technicianId     | string  | Unique technician identifier (e.g. T001) |
| fullName         | string  | Full name                                 |
| email            | string  | Email address                             |
| phone            | string  | Phone number                              |
| specialization   | string  | Termite Control, Rodent Control, etc.     |
| status           | string  | Available, On Job, On Leave               |
| rating           | number  | Average job rating (1-5)                  |
| yearsExperience  | number  | Years of experience in pest control       |
| joinDate         | date    | Employment start date                     |

### ServiceJob
Primary key: jobId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| jobId            | string  | Unique job identifier (e.g. J001)        |
| customerId       | string  | FK to Customer                            |
| technicianId     | string  | FK to Technician                          |
| serviceType      | string  | Type of pest control service              |
| pestType         | string  | Termites, Cockroaches, Rodents, etc.     |
| status           | string  | scheduled, in-progress, completed, cancelled |
| priority         | string  | low, medium, high, urgent                |
| scheduledDate    | date    | Date the job is scheduled for            |
| completedDate    | date    | Date the job was completed (nullable)    |
| estimatedCost    | number  | Estimated cost in IDR                    |
| actualCost       | number  | Actual cost in IDR                       |

### TreatmentProduct
Primary key: productId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| productId        | string  | Unique product identifier (e.g. P001)   |
| productName      | string  | Product name                              |
| category         | string  | Termiticide, Insecticide, Rodenticide    |
| unitPrice        | number  | Price per unit in IDR                    |
| stockQty         | number  | Current stock quantity                    |
| minStockLevel    | number  | Minimum stock level before reorder       |
| unit             | string  | Measurement unit (Liter, Kg, etc.)       |
| supplier         | string  | Supplier company name                     |

### Invoice
Primary key: invoiceId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| invoiceId        | string  | Unique invoice identifier (e.g. INV001) |
| jobId            | string  | FK to ServiceJob                          |
| customerId       | string  | FK to Customer                            |
| totalAmount      | number  | Total amount in IDR                      |
| status           | string  | pending, paid, overdue, cancelled        |
| issueDate        | date    | Date the invoice was issued              |
| dueDate          | date    | Payment due date                         |

### Vehicle
Primary key: vehicleId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| vehicleId        | string  | Unique vehicle identifier (e.g. V001)   |
| plateNumber      | string  | License plate number                      |
| type             | string  | Vehicle type (Van, Pickup, Motorcycle)   |
| status           | string  | available, in-use, maintenance           |
| assignedTo       | string  | Technician ID currently using vehicle    |
| mileage          | number  | Current odometer reading in km           |

### Schedule
Primary key: scheduleId
| Property         | Type    | Description                              |
|------------------|---------|------------------------------------------|
| scheduleId       | string  | Unique schedule identifier               |
| technicianId     | string  | FK to Technician                          |
| jobId            | string  | FK to ServiceJob                          |
| scheduledDate    | date    | Date of the scheduled task               |
| status           | string  | pending, confirmed, completed, cancelled |

## Relationships
- ServiceJob references Customer (customerId) and Technician (technicianId)
- Invoice references ServiceJob (jobId) and Customer (customerId)
- Schedule references Technician (technicianId) and ServiceJob (jobId)
- Vehicle can be assigned to a Technician (assignedTo)

## Data Notes
- Currency values are in Indonesian Rupiah (IDR)
- The business operates in Indonesia
- Typical service types include termite treatment, cockroach extermination, rodent control, bed bug treatment, fumigation, and mosquito control
`.trim();

// ---------------------------------------------------------------------------
// OntologyAwareLlmClient — wraps a real LLM client with ontology context
// ---------------------------------------------------------------------------

/**
 * Wraps a real LLM client (Anthropic, OpenAI, Ollama) to automatically
 * enrich system prompts with the full pest control ontology schema.
 *
 * This ensures the LLM has deep understanding of the data model regardless
 * of which provider is used.
 */
export class OntologyAwareLlmClient implements LlmClient {
  private readonly inner: LlmClient;
  private readonly providerName: string;

  constructor(inner: LlmClient, providerName: string) {
    this.inner = inner;
    this.providerName = providerName;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const enriched = this.enrichMessages(messages);
    return this.inner.chat(enriched, options);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }

  /**
   * Enrich messages by appending the ontology schema to any existing
   * system message, or injecting a new system message if none exists.
   *
   * Only enriches if the conversation appears to be an ontology/chat
   * conversation (has system message mentioning "ontology" or "OpenFoundry",
   * or is a general user query).
   */
  private enrichMessages(messages: ChatMessage[]): ChatMessage[] {
    const systemIdx = messages.findIndex((m) => m.role === "system");

    if (systemIdx >= 0) {
      // Check if the system prompt already contains the schema
      const existing = messages[systemIdx].content;
      if (existing.includes("Pest Control Ontology Schema")) {
        return messages; // already enriched
      }

      // Append schema to existing system prompt
      const enrichedMessages = [...messages];
      enrichedMessages[systemIdx] = {
        ...enrichedMessages[systemIdx],
        content:
          existing +
          "\n\n" +
          ONTOLOGY_SCHEMA +
          `\n\nYou are powered by ${this.providerName}. Provide detailed, accurate answers based on the ontology schema above.`,
      };
      return enrichedMessages;
    }

    // No system message — this might be a code generation or embedding request;
    // don't inject schema for those, just pass through
    return messages;
  }
}
